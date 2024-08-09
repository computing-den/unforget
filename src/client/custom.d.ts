declare module '*.svg' {
  const content: string;
  export default content;
}
declare module '*.txt' {
  const content: string;
  export default content;
}
declare module '*.md' {
  const content: string;
  export default content;
}
// declare module '*.svg' {
//   const content: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
//   export default content;
// }

interface Window {
  unforgetContextId: string;
}
