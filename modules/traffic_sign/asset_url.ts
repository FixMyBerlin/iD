/**
 * `import()` needs a `./`-relative or absolute URL; `context.asset()` returns paths like `dist/...`.
 */
export function importableAssetUrl(context: iD.Context, path: string) {
    const asset = context.asset(path);
    if (/^https?:\/\//i.test(asset)) return asset;
    if (asset.startsWith('./') || asset.startsWith('../')) return asset;
    if (asset.startsWith('/')) return new URL(asset, window.location.origin).href;
    return new URL('./' + asset, window.location.href).href;
}
