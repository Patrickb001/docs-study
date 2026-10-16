import type { CSSProperties } from 'react';
import { filePath, isFileUrl } from '../files';

// A link to the page a question came from. A page from a file has no web address, so it names the file instead.
// "lead" is text before the link. "prefix" is text inside the link, before the page's title.
export function DocLink(props: { url: string; title: string; lead?: string; prefix?: string; style?: CSSProperties }) {
  if (isFileUrl(props.url)) return <span style={props.style}>From your file: {filePath(props.url)}</span>;
  return (
    <>
      {props.lead}
      <a href={props.url} target="_blank" rel="noreferrer" style={props.style}>{props.prefix}{props.title}</a>
    </>
  );
}
