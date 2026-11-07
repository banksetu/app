/** Lightweight placeholder for Android/web bundles. The real engine is
 * compiled into the Windows EXE only, and runtime/route guards also apply.
 * Never fetches templates, accesses customer data or calls print bridges.
 */
export default function LayoutUnavailable(){
  return <p role="status">Customize Layout is available only in BANK SETU Windows EXE. Standard bank/customer features remain available here.</p>;
}
