/** Lightweight visual QA for imported bank passbook reference vs editable reconstruction.
 * Diagnostic only: scanner resampling and printer dots affect measured pixels.
 */
export type DiffMeasurement = {meanDifferencePercent:number; pixels:number; strongMismatchPercent:number};
export function measureLayoutDifference(reference:Uint8ClampedArray, candidate:Uint8ClampedArray):DiffMeasurement {
  if(reference.length!==candidate.length || reference.length%4!==0 || reference.length===0)
    throw Error("Reference and candidate renders require equal nonempty RGBA buffers.");
  let sum=0,strong=0,count=0;
  for(let i=0;i<reference.length;i+=4){
    const r=reference[i+3]/255,g=candidate[i+3]/255;
    const diffs=[0,1,2].map(ch=>Math.abs((reference[i+ch]*r+255*(1-r))-(candidate[i+ch]*g+255*(1-g))));
    const normalized=(diffs[0]+diffs[1]+diffs[2])/765;
    sum+=normalized;strong+=normalized>.15?1:0;count++;
  }
  return {
    meanDifferencePercent:Math.round(sum/count*10000)/100,
    strongMismatchPercent:Math.round(strong/count*10000)/100,
    pixels:count,
  };
}
