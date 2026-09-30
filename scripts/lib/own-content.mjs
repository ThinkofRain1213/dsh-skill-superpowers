// What belongs to this adapter, and what belongs to upstream.
//
// `skills/` holds both: the vendored upstream tree, and the skills this package
// authors itself. A sync must rebuild the first without touching the second, and
// both sync-skills.mjs and generate-artifacts.mjs must agree on which is which —
// so this module is the single reader of artifacts.json's ownership maps.
import { readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/** Read artifacts.json. */
function readManifest(packageRoot) {
  return JSON.parse(readFileSync(join(packageRoot, 'artifacts.json'), 'utf8'))
}

/** Absolute path of the skills root. */
export function skillsRoot(packageRoot) {
  const manifest = readManifest(packageRoot)
  return join(packageRoot, manifest.skillTree?.root ?? 'skills')
}

/**
 * Skill directory names this package authors itself.
 *
 * These live natively in `skills/` (no second copy anywhere), so a sync must
 * treat them as untouchable.
 */
export function ownSkillNames(packageRoot) {
  const manifest = readManifest(packageRoot)
  return new Set(manifest.skillTree?.own ?? [])
}

/**
 * Files that must exist inside `skills/` but whose master copy is kept outside
 * it, because a sync replaces the upstream-owned directory around them.
 *
 * The maintenance skills are NOT here: they are our own top-level directories
 * under `skills/`, which a sync never touches. Only content that has to live
 * *inside* an upstream-owned directory needs this treatment.
 */
export function ownContentInSkillsTree(packageRoot) {
  const manifest = readManifest(packageRoot)
  const root = skillsRoot(packageRoot)
  const out = []
  for (const [from, to] of Object.entries(manifest.copies ?? {})) {
    if (from.startsWith('$') || to.startsWith('$')) continue
    // Only copies that land under skills/ belong to the sync's expected tree.
    const rel = relative(root, join(packageRoot, to))
    if (rel.startsWith('..') || rel === '' || resolve(root, rel) !== resolve(packageRoot, to)) continue
    out.push({ from: join(packageRoot, from), targetRel: rel.split(sep).join('/') })
  }
  return out.sort((a, b) => a.targetRel.localeCompare(b.targetRel))
}

// ---------------------------------------------------------------------------
// Upstream coordinates
// ---------------------------------------------------------------------------

/**
 * The upstream project this package vendors from, as recorded in package.json.
 *
 * `package.json#upstream` is the ONE place the upstream repository is named.
 * Scripts read it from here rather than hard-coding a URL, so renaming or
 * re-pointing upstream is a single edit and there is exactly one string to
 * audit.
 */
export function upstreamPin(packageRoot) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const pin = manifest.upstream
  if (pin === undefined || typeof pin.repository !== 'string' || pin.repository === '') {
    throw new Error('package.json#upstream.repository is required to locate the vendored source')
  }
  return pin
}
