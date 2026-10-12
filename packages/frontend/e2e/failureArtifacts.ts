import {mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// CI uploads this directory when the browser tests fail.
const directory = join(
  process.env['RUNNER_TEMP'] ?? tmpdir(),
  'browser-failures'
);

export async function saveFailureArtifacts(
  files: Record<string, string | Uint8Array>
) {
  await mkdir(directory, {recursive: true});
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(directory, name), contents);
  }
}
