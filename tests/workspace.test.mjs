import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workspaceYaml = readFileSync(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8');
// Use the invoking pnpm entry point instead of executing a Windows .cmd shim.
const pnpmEntry = process.env.npm_execpath;

test('cms:install honors workspace build approvals and shares the root lockfile', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'koharu-workspace-'));
  const packageName = 'koharu-cms-build-fixture';

  try {
    mkdirSync(path.join(root, 'cms'));
    mkdirSync(path.join(root, 'build-fixture'));
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: packageJson.name,
        packageManager: packageJson.packageManager,
        scripts: { 'cms:install': packageJson.scripts['cms:install'] },
      }),
    );
    const workspace = parse(workspaceYaml);
    // pnpm 11 requires source-specific approval for a local tarball, not just its package name.
    workspace.allowBuilds[`${packageName}@file:${packageName}-1.0.0.tgz`] = true;
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), stringify(workspace));
    writeFileSync(
      path.join(root, 'build-fixture', 'package.json'),
      JSON.stringify({
        name: packageName,
        version: '1.0.0',
        scripts: { install: "node -e \"require('node:fs').writeFileSync('built.txt', 'ok')\"" },
      }),
    );
    execFileSync(process.execPath, [pnpmEntry, 'pack', '--pack-destination', root], {
      cwd: path.join(root, 'build-fixture'),
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 20_000,
    });
    writeFileSync(
      path.join(root, 'cms', 'package.json'),
      JSON.stringify({
        name: 'astro-koharu-cms',
        private: true,
        dependencies: { [packageName]: `file:../${packageName}-1.0.0.tgz` },
      }),
    );

    execFileSync(process.execPath, [pnpmEntry, 'cms:install', '--offline', '--store-dir', path.join(root, 'store')], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 20_000,
    });

    assert.ok(
      existsSync(path.join(root, 'cms', 'node_modules', packageName, 'built.txt')),
      'CMS dependency build scripts must honor approvals from the root pnpm-workspace.yaml',
    );
    assert.ok(existsSync(path.join(root, 'pnpm-lock.yaml')), 'CMS must use the root lockfile');
    assert.ok(!existsSync(path.join(root, 'cms', 'pnpm-lock.yaml')), 'CMS must not create a separate lockfile');
    assert.ok(!existsSync(path.join(root, 'cms', 'pnpm-workspace.yaml')), 'CMS must not create a separate workspace');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
