// Bank Setu owned, private stdio helper. No HTTP listener, service, spool queue or customer files.
using System;
using System.IO;
using System.IO.Ports;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Management;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

class Bridge {
 const int Protocol=1;
 static JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=2000000 };
 static Stream stream; static SerialPort serial; static SafeFileHandle handle;
 static Dictionary<string,Device> devices=new Dictionary<string,Device>();
 class Device { public string id; public string name; public string transport; public string path; }
 [StructLayout(LayoutKind.Sequential)] struct InterfaceData { public int size;public Guid guid;public int flags;public IntPtr reserved; }
 [DllImport("setupapi.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr SetupDiGetClassDevs(ref Guid guid,string enumerator,IntPtr parent,uint flags);
 [DllImport("setupapi.dll",SetLastError=true)] static extern bool SetupDiEnumDeviceInterfaces(IntPtr list,IntPtr info,ref Guid guid,uint index,ref InterfaceData data);
 [DllImport("setupapi.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr list,ref InterfaceData data,IntPtr detail,int size,out int required,IntPtr info);
 [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string file,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,IntPtr input,int inputSize,byte[] output,int outputSize,out int returned,IntPtr overlapped);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CancelIoEx(SafeFileHandle handle,IntPtr overlapped);
 static string Text(Dictionary<string,object> x,string key) {return x.ContainsKey(key)?Convert.ToString(x[key]):"";}
 static int Number(Dictionary<string,object> x,string key,int fallback) {return x.ContainsKey(key)?Convert.ToInt32(x[key]):fallback;}
 static void Add(string path,string name,string transport) {
  using(var sha=System.Security.Cryptography.SHA256.Create()) {
   string id=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(transport+":"+path))).Replace("-","").ToLowerInvariant();
   devices[id]=new Device {id=id,path=path,name=name,transport=transport};
  }
 }
 static object List() {
  if(stream!=null)throw new Exception("A printer job is active.");devices.Clear();
  Guid guid=new Guid("28d78fad-5a12-11d1-ae5b-0000f803a8c2");
  IntPtr list=SetupDiGetClassDevs(ref guid,null,IntPtr.Zero,0x12);
  if(list!=new IntPtr(-1))try {
   for(uint i=0;i<64;i++) {
    InterfaceData data=new InterfaceData {size=Marshal.SizeOf(typeof(InterfaceData))};
    if(!SetupDiEnumDeviceInterfaces(list,IntPtr.Zero,ref guid,i,ref data))break;
    int size;SetupDiGetDeviceInterfaceDetail(list,ref data,IntPtr.Zero,0,out size,IntPtr.Zero);
    if(size<8||size>32768)continue;
    IntPtr memory=Marshal.AllocHGlobal(size);
    try {Marshal.WriteInt32(memory,IntPtr.Size==8?8:6);
     if(!SetupDiGetDeviceInterfaceDetail(list,ref data,memory,size,out size,IntPtr.Zero))continue;
     string devicePath=Marshal.PtrToStringUni(IntPtr.Add(memory,4)),name="USB printer (identity unavailable)";
     // IEEE1284 identity only; never issue a printer reset or change driver/protocol.
     using(var h=CreateFile(devicePath,0xC0000000,3,IntPtr.Zero,3,0,IntPtr.Zero)) {
      if(!h.IsInvalid){byte[] bytes=new byte[4096];int got;if(DeviceIoControl(h,0x220034,IntPtr.Zero,0,bytes,bytes.Length,out got,IntPtr.Zero)&&got>2)name=Encoding.ASCII.GetString(bytes,2,got-2).TrimEnd('\0');}
     }
     Add(devicePath,name,"usb-direct");
    } finally {Marshal.FreeHGlobal(memory);}
   }
  } finally {SetupDiDestroyDeviceInfoList(list);}
  foreach(var port in SerialPort.GetPortNames().Take(64))Add(port,port+" (manual identification required)","serial");
  try {using(var search=new ManagementObjectSearcher("SELECT DeviceID,Name FROM Win32_ParallelPort"))foreach(ManagementObject item in search.Get())Add("\\\\.\\"+Convert.ToString(item["DeviceID"]),Convert.ToString(item["Name"]),"parallel-direct");}catch(ManagementException){}
  // Show spooler destinations for diagnostics only. RAW WritePrinter is deliberately not used.
  var queues=new List<object>();
  try {using(var search=new ManagementObjectSearcher("SELECT Name,PortName,DriverName,WorkOffline,PrinterStatus FROM Win32_Printer"))foreach(ManagementObject item in search.Get())queues.Add(new {name=Convert.ToString(item["Name"]),port=Convert.ToString(item["PortName"]),driver=Convert.ToString(item["DriverName"]),offline=Convert.ToBoolean(item["WorkOffline"]??false)});}catch(ManagementException){}
  return new {devices=devices.Values.Select(d=>new {d.id,d.name,d.transport}).ToArray(),queues=queues.ToArray()};
 }
 static void Close() {try {if(handle!=null&&!handle.IsInvalid)CancelIoEx(handle,IntPtr.Zero);}catch{}try{if(serial!=null)serial.Dispose();else if(stream!=null)stream.Dispose();}catch{}if(handle!=null)handle.Dispose();stream=null;serial=null;handle=null;}
 static object Run(Dictionary<string,object> x) {
  switch(Text(x,"op")) {
   case "hello":return new {protocol=Protocol,name="Bank Setu Universal PR2 Printer Bridge"};
   case "list":return List();
   case "open": {
    if(stream!=null)throw new Exception("Printer is busy.");
    // Enumerate again in this process. Renderer never supplies a file path.
    List();Device d;if(!devices.TryGetValue(Text(x,"deviceId"),out d))throw new Exception("Selected printer is disconnected or changed.");
    if(d.transport=="serial"){
     int baud=Number(x,"baud",9600),dataBits=Number(x,"dataBits",8),stop=Number(x,"stopBits",1);string parity=Text(x,"parity");
     if(!new[]{4800,9600,19200,38400,57600,115200}.Contains(baud)||dataBits!=8||stop!=1||!new[]{"None","Even","Odd"}.Contains(parity))throw new Exception("Unsupported serial settings.");
     serial=new SerialPort(d.path,baud,(Parity)Enum.Parse(typeof(Parity),parity),dataBits,StopBits.One){ReadTimeout=3000,WriteTimeout=10000,Handshake=Handshake.None};
     serial.Open();stream=serial.BaseStream;
    } else {
     handle=CreateFile(d.path,0xC0000000,0,IntPtr.Zero,3,0x40000000,IntPtr.Zero);
     if(handle.IsInvalid)throw new Exception("Printer access failed (Windows "+Marshal.GetLastWin32Error()+"). Close other printer applications; check USB/COM/LPT and the driver. No driver is replaced.");
     // Avoid managed read-ahead across PR2 command/response transactions.
     stream=new FileStream(handle,FileAccess.ReadWrite,1,true);
    }
    return new {opened=true};
   }
   case "write": {
    if(stream==null)throw new Exception("Printer not connected.");string encoded=Text(x,"data");if(encoded.Length>500000)throw new Exception("Printer packet too large.");
    byte[] bytes=Convert.FromBase64String(encoded);stream.Write(bytes,0,bytes.Length);stream.Flush();return new {written=bytes.Length};
   }
   case "capture": {
    if(stream==null||handle==null)throw new Exception("Direct USB printer is not connected.");
    byte[] bytes=new byte[256];int total=0;bool quiet=false;int zeroReads=0;
    var segments=new List<object>();var watch=System.Diagnostics.Stopwatch.StartNew();long lastByteAt=0;
    while(total<bytes.Length && watch.ElapsedMilliseconds<1500){
     int wait=total==0?1000-(int)watch.ElapsedMilliseconds:150-(int)(watch.ElapsedMilliseconds-lastByteAt);
     wait=Math.Min(wait,1500-(int)watch.ElapsedMilliseconds);
     if(wait<=0){quiet=true;break;}
     var pending=stream.BeginRead(bytes,total,bytes.Length-total,null,null);
     if(!pending.AsyncWaitHandle.WaitOne(wait)){
      CancelIoEx(handle,IntPtr.Zero);int late=0;
      try{late=stream.EndRead(pending);}catch(IOException){}
      if(late>0){segments.Add(new {offset=total,count=late,elapsedMs=watch.ElapsedMilliseconds,cancelRace=true});total+=late;}
      quiet=true;break;
     }
     int n=stream.EndRead(pending);
     if(n==0){
      // Observed PLQ-20 USB interface completes empty reads before a delayed reply.
      // Bound the wait before issuing the next command; never infer readiness here.
      zeroReads++;System.Threading.Thread.Sleep(Math.Min(25,Math.Max(1,wait)));
      continue;
     }
     segments.Add(new {offset=total,count=n,elapsedMs=watch.ElapsedMilliseconds,cancelRace=false});total+=n;lastByteAt=watch.ElapsedMilliseconds;
    }
    if(watch.ElapsedMilliseconds>=1500)quiet=true;
    return new {data=Convert.ToBase64String(bytes,0,total),segments=segments,zeroReads=zeroReads,quietTimeout=quiet,limitReached=total==bytes.Length};
   }
   case "read": {
    if(stream==null)throw new Exception("Printer not connected.");int count=Number(x,"count",0);if(count<1||count>4096)throw new Exception("Invalid response size.");
    byte[] bytes=new byte[count];int total=0;
    while(total<count){int n=stream.Read(bytes,total,count-total);if(n==0)throw new Exception("Printer disconnected before its status reply.");total+=n;}
    return new {data=Convert.ToBase64String(bytes)};
   }
   case "close":Close();return new {closed=true};
   default:throw new Exception("Unsupported Bridge operation.");
  }
 }
 static int Main(string[] args) {
  if(!Console.IsInputRedirected||!Console.IsOutputRedirected)return 2;
  Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
  try {string line;while((line=Console.ReadLine())!=null){if(line.Length>2000000)return 3;Dictionary<string,object> request=null;object id=0;
   try {request=json.Deserialize<Dictionary<string,object>>(line);id=request["id"];Console.WriteLine(json.Serialize(new {id=id,result=Run(request)}));}
   catch(Exception e){Console.WriteLine(json.Serialize(new {id=id,error=e is IOException?"Printer disconnected or access failed.":e.Message}));}
  }}finally{Close();}return 0;
 }
}
