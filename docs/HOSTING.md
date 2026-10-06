# Hosting

A build is a folder of static files: `dist/` holds `index.html`, `photos/`,
`fonts/`, `og.jpg` and the crawler files. There is no database, no server-side
runtime and no build step on the host, so anywhere that serves files will do.

Four ways, in the order most people want them. Every provider detail below links
to that provider's own documentation, which is the only place that stays correct
after they move a button.

| | Free tier | How it goes up | Custom domain |
| --- | --- | --- | --- |
| [GitHub Pages](#github-pages) | yes | the workflow in this repository | DNS records + the Pages setting |
| [Cloudflare Pages](#cloudflare-pages) | yes | Git integration, or drag a zip / folder | DNS in Cloudflare, then the project's tab |
| [Netlify](#netlify) | yes | Git integration, or drag a folder onto Netlify Drop | DNS records + the site's domain settings |
| [Your own server](#your-own-server) | you pay for the box | `rsync` from the machine that built it | DNS to the box, certificate on the box |

## Before you deploy, wherever you deploy

1. **Set the address.** Put your domain in `siteUrl` in `wall.config.json`, or in
   a `CNAME` file in the project root (the build uses it as a fallback and copies
   it into the output). It is baked into the canonical link, the social tags and
   `sitemap.xml`, so setting it after the fact means rebuilding.
2. **Build.** `node gen.js --yes` writes `dist/`. `--check` lays the wall out and
   writes nothing, which is the cheap way to see what a change would do.
3. **The wall works at a subpath.** Every URL in the page is relative, so
   `https://example.com/photos/` is as valid as a domain root. The live demo is a
   project page under `/keret/`.
4. **A rebuild is byte-identical**, so re-deploying an unchanged wall changes
   nothing. From the Keret checkout, `node scripts/check-stamp.js dist/index.html`
   says whether a built folder still matches the code and config that produced it.
5. **`CNAME` only means something to GitHub Pages.** Elsewhere it just sits in
   the output as an extra file nobody reads; `siteUrl` is the cleaner way to set
   the address on every host.
6. **Watch the file sizes if you raise `maxEdge`.** Served copies are whatever
   `images.maxEdge` and `images.quality` produce: the demo's are 100-330 kB, the
   largest 327 kB. At full resolution each photo becomes multi-megabyte, and some
   hosts cap what a single file may be.

## GitHub Pages

This repository ships the workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
runs the test suite and the build checks, then publishes `demo/dist`, on every
push to `main`. A failing check blocks the deploy.

1. Push the repository to GitHub.
2. `Settings > Pages > Build and deployment > Source = "GitHub Actions"`. Nothing
   else to configure; there is no branch to pick.
3. Push to `main` and watch `Actions`. The site appears at
   `https://<user>.github.io/<repo>/`.

For your own wall, two shapes:

- **Commit the build** (what this repository does): keep `dist/` in the repo, point
  the workflow's `path:` at it, and the stamp keeps a stale build from shipping.
- **Build in the workflow**: add `npm ci` and `node gen.js --yes` before the upload
  step, and keep `dist/` out of git. `sharp` installs from prebuilt binaries on the
  runner, so the build takes seconds.

Custom domain: set it in `Settings > Pages > Custom domain` and keep `CNAME` in
the project root so the file travels with the artifact. Then point DNS at GitHub:

| Record | Name | Value |
| --- | --- | --- |
| `A` | `@` (apex) | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| `AAAA` | `@` (apex) | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| `CNAME` | `www`, or any subdomain | `<user>.github.io` |

If the domain's DNS is already on Cloudflare, the records go there like any other.
GitHub then issues the certificate, which takes a few minutes and needs "Enforce
HTTPS" switched on once it is ready.

- [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## Cloudflare Pages

Two ways in, and they are not interchangeable: **a Direct Upload project can
never be switched to Git integration later**, so pick the one you want to live
with. Both are free.

**Direct Upload** (no repository needed):

- Dashboard: **Workers & Pages > Create application > Get started > Drag and drop
  your files**, name the project, drop your `dist/` folder **or a zip of it**,
  then **Deploy site**.
- Or from the terminal: `npx wrangler pages deploy dist`.

Watch the caps, because a wall is mostly files: **drag and drop stops at 1,000
files and 25 MiB per file**; Wrangler raises that to 20,000. A build is one file
per photo plus about eight (the demo: 105 photos, 113 files), so drag and drop
reaches roughly 990 photos and Wrangler far more than a wall will hold. Wrangler
does not accept a zip.

**Git integration**: connect the repository, build command `node gen.js --yes`,
output directory `dist`. Every push then deploys, and pull requests get preview
URLs.

Custom domain: the project's **Custom domains** tab, then the DNS record it asks
for. A domain already on Cloudflare needs no extra nameserver work.

- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## Netlify

**Drag and drop**: open [Netlify Drop](https://app.netlify.com/drop) and drop the
`dist/` folder (or a zip of it) onto the page. It deploys and gives you a URL;
Netlify's quickstart covers the account side.

**Git integration**: connect the repository, build command `node gen.js --yes`,
publish directory `dist`. Pushes then deploy, and pull requests get deploy
previews.

Custom domain: **Domain management** in the site's configuration, then either
Netlify DNS or the records it shows for DNS you keep elsewhere — including
Cloudflare, where they go in like any other record. HTTPS is provisioned
automatically.

- [Netlify Drop](https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/)
- [Deploys](https://docs.netlify.com/deploy/deploy-overview/)
- [Domains](https://docs.netlify.com/manage/domains/get-started-with-domains/)

## Your own server

The wall is a folder, so this is `rsync` and a static server. A small VPS, a
Raspberry Pi or the machine already running your other services is enough: the
105-photo demo is about 10 MB served, and nothing is computed at request time.

```sh
# on the machine that built it, in your wall directory
node gen.js --yes
rsync -av --delete dist/ you@your-server:/var/www/wall/
```

**Caddy** gets a certificate on its own, so a Caddyfile is the whole config:

```
photos.example.com {
  root * /var/www/wall
  file_server
}
```

**nginx** needs the certificate issued separately (for example with certbot):

```nginx
server {
  listen 80;
  server_name photos.example.com;
  root /var/www/wall;
  index index.html;
}
```

Then point DNS at the box: an `A` record to its IPv4 address, an `AAAA` record if
it has IPv6. If the domain is behind a proxy such as Cloudflare, keep it in DNS-only
mode until the certificate exists, then turn the proxy on.

- [Caddy: static files](https://caddyserver.com/docs/quick-starts/static-files)
- [nginx: beginner's guide](https://nginx.org/en/docs/beginners_guide.html)

## If something breaks

- **The page loads, the type does not.** The face travels in `dist/fonts/`; a
  deploy that copied only the HTML and the photos leaves the wall in the system
  font. Re-upload the whole output folder, not a selection of it.
- **404 after adding a custom domain.** DNS has not caught up, or the record is
  missing. `dig +short your-domain` should answer with the host's address.
- **The certificate is still pending after 15 minutes.** Check the records
  against the table above (GitHub) or the panel's own values; a wrong name or a
  missing one of a set is the usual cause.
- **A shared link has no preview image.** `siteUrl` was empty when the wall was
  built, so no social tags were written. Set it and build again.
