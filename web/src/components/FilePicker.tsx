import type { ChangeEvent } from 'react';
import { readPicked, type Picked } from '../files';

// Two buttons, one for picking files and one for picking a whole folder.
// The choice is cleared after each pick, so choosing the same files again still counts. That is how edits are added.
export function ChooseFiles(props: { onPicked: (picked: Picked) => void; onProblem: (message: string) => void; disabled?: boolean }) {
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (list.length === 0) return;
    try {
      props.onPicked(await readPicked(list));
    } catch {
      props.onProblem('Those files could not be read. Try choosing them again.');
    }
  };
  // Browsers call a folder picker "webkitdirectory", although every modern browser has it.
  const folder = { webkitdirectory: '' } as Record<string, string>;
  return (
    <>
      <label className="btn second small file-pick">
        Choose files
        <input type="file" multiple accept=".md,.markdown,.mdx,text/markdown" className="sr-only" disabled={props.disabled} onChange={pick} />
      </label>
      <label className="btn second small file-pick">
        Choose a folder
        <input type="file" multiple className="sr-only" disabled={props.disabled} onChange={pick} {...folder} />
      </label>
    </>
  );
}
