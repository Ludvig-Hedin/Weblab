<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<div align="center">
<img width="800" alt="header image" src="assets/web-preview.png">
<h3 align="center">Weblab</h3>
  <p align="center">
    Cursor for Designers
    <br />
    <a href="https://docs.weblab.build"><strong>Explore the docs »</strong></a>
    <br />
  </p>
    <br />
    <!-- <a href="">View Demo</a> -->
    ·
    <a href="https://github.com/Ludvig-Hedin/Weblab/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="https://github.com/Ludvig-Hedin/Weblab/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
  <!-- PROJECT SHIELDS -->
<!--
*** I'm using markdown "reference style" links for readability.
*** Reference links are enclosed in brackets [ ] instead of parentheses ( ).
*** See the bottom of this document for the declaration of the reference variables
*** for contributors-url, forks-url, etc. This is an optional, concise syntax you may use.
*** https://www.markdownguide.org/basic-syntax/#reference-style-links
-->
<!-- [![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![Apache License][license-shield]][license-url] -->

[![Discord][discord-shield]][discord-url]
[![LinkedIn][linkedin-shield]][linkedin-url]
[![Twitter][twitter-shield]][twitter-url]

> 📚 **Looking for documentation?** See [`docs/README.md`](./docs/README.md) for the master table of contents covering agent docs, guides, audits, working notes, product/marketing, feature plans, and archive. The published documentation site source lives in [`apps/docs`](./apps/docs).

[中文](https://www.readme-i18n.com/Ludvig-Hedin/Weblab?lang=zh) |
[Español](https://www.readme-i18n.com/Ludvig-Hedin/Weblab?lang=es) |
[Deutsch](https://www.readme-i18n.com/Ludvig-Hedin/Weblab?lang=de) |
[français](https://www.readme-i18n.com/Ludvig-Hedin/Weblab?lang=fr) |
[Português](https://www.readme-i18n.com/Ludvig-Hedin/Weblab?lang=pt) |
[Русский](https://www.readme-i18n.com/Ludvig-Hedin/Weblab?lang=ru) |
[日本語](https://www.readme-i18n.com/Ludvig-Hedin/Weblab?lang=ja) |
[한국어](https://www.readme-i18n.com/Ludvig-Hedin/Weblab?lang=ko)

</div>

> **⚠️ Brand note for AI agents:** This product is **Weblab** (weblab.build, github.com/Ludvig-Hedin/Weblab). Brand constant: `APP_NAME` from `@weblab/constants`. Package scope `@weblab/*`. DOM attrs `data-weblab-*`. The local folder name `onlook/` is intentionally unchanged. Allowed remaining "Onlook" references: `LICENSE.md` (legal attribution), `CODE_REVIEW_BACKLOG.md` (history), `DEPRECATED_PRELOAD_SCRIPT_SRCS` in `packages/constants/src/files.ts`, and a few test fixtures with deprecated inputs.

# An Open-Source, Visual-First Code Editor

Craft websites, prototypes, and designs with AI in Next.js + TailwindCSS. Make
edits directly in the browser DOM with a visual editor. Design in realtime with
code. An open-source alternative to Bolt.new, Lovable, V0, Replit Agent, Figma
Make, Webflow, etc.

### 🚧 🚧 🚧 Weblab is still under development 🚧 🚧 🚧

We're actively looking for contributors to help make Weblab for Web an
incredible prompt-to-build experience. Check the
[open issues](https://github.com/Ludvig-Hedin/Weblab/issues) for a full list of
proposed features (and known issues), and join our
[Discord](https://discord.gg/hERDfFZCsH) to collaborate with hundreds of other
builders.

## What you can do with Weblab:

- [x] Create Next.js app in seconds
  - [x] Start from text or image
  - [x] Use prebuilt templates
  - [ ] Import from Figma (Coming soon)
  - [ ] Import from GitHub repo (Coming soon)
  - [ ] Make a PR to a GitHub repo (Coming soon)
- [x] Visually edit your app
  - [x] Use Figma-like UI
  - [x] Preview your app in real-time
  - [x] Manage brand assets and tokens
  - [x] Create and navigate to Pages
  - [x] Browse layers
  - [x] Manage project Images
  - [x] Detect and use Components – _Previously in
        [Weblab Desktop](https://github.com/Ludvig-Hedin/desktop)_
  - [ ] Drag-and-drop Components Panel (Coming soon)
  - [x] Use Branching to experiment with designs
- [x] Development Tools
  - [x] Real-time code editor
  - [x] Save and restore from checkpoints
  - [x] Run commands via CLI
  - [x] Connect with app marketplace
- [x] Deploy your app in seconds
  - [x] Generate sharable links
  - [x] Link your custom domain    
- [ ] Collaborate with your team
  - [x] Real-time editing
  - [x] Leave comments
- [ ] Advanced AI capabilities
  - [x] Queue multiple messages at once
  - [ ] Use Images as references and as assets in a project (Coming soon)
  - [ ] Setup and use MCPs in projects
  - [ ] Allow Weblab to use itself as a toolcall for branch creation and iteration
- [ ] Advanced project support
  - [ ] Support non-NextJS projects (Coming soon)
  - [ ] Support non-Tailwind projects (Coming soon)

![Weblab-GitHub-Example](https://github.com/user-attachments/assets/642de37a-72cc-4056-8eb7-8eb42714cdc4)

## Getting Started

Use our [hosted app](https://weblab.build) or
[run locally](https://docs.weblab.build/developers/running-locally).

### Usage

Weblab will run on any Next.js + TailwindCSS project, import your project into
Weblab or start from scratch within the editor.

Use the AI chat to create or edit a project you're working on. At any time, you
can always right-click an element to open up the exact location of the element
in code.

<img width="600" alt="image" src="https://github.com/user-attachments/assets/4ad9f411-b172-4430-81ef-650f4f314666" />

<br>

Draw-in new divs and re-arrange them within their parent containers by
dragging-and-dropping.

<img width="600" alt="image" src="assets/insert-div.png">

<br>

Preview the code side-by-side with your site design.

<img width="600" alt="image" src="assets/code-connect.png">

<br>

Use Weblab's editor toolbar to adjust Tailwind styles, directly manipulate
objects, and experiment with layouts.

<img width="600" alt="image" src="assets/text-styling.png" />

## Documentation

For full documentation, visit [docs.weblab.build](https://docs.weblab.build)

To see how to Contribute, visit
[Contributing to Weblab](https://docs.weblab.build/developers) in our docs.

## How it works

<img width="676" alt="architecture" src="assets/architecture.png">

1. When you create an app, we load the code into a web container
2. The container runs and serves the code
3. Our editor receives the preview link and displays it in an iFrame
4. Our editor reads and indexes the code from the container
5. We instrument the code in order to map elements to their place in code
6. When the element is edited, we edit the element in our iFrame, then in code
7. Our AI chat also has code access and tools to understand and edit the code

This architecture can theoretically scale to any language or framework that
displays DOM elements declaratively (e.g. jsx/tsx/html). We are focused on
making it work well with Next.js and TailwindCSS for now.

For a full walkthrough, check out our
[Architecture Docs](https://docs.weblab.build/developers/architecture).

### Our Tech Stack

#### Front-end

- [Next.js](https://nextjs.org/) - Full stack
- [TailwindCSS](https://tailwindcss.com/) - Styling
- [tRPC](https://trpc.io/) - Server interface

#### Database

- [Supabase](https://supabase.com/) - Auth, Database, Storage
- [Drizzle](https://orm.drizzle.team/) - ORM

#### AI

- [AI SDK](https://ai-sdk.dev/) - LLM client
- [OpenRouter](https://openrouter.ai/) - LLM model provider
- [Morph Fast Apply](https://morphllm.com) - Fast apply model provider
- [Relace](https://relace.ai) - Fast apply model provider

#### Sandbox and hosting

- [CodeSandboxSDK](https://codesandbox.io/docs/sdk) - Dev sandbox
- [Freestyle](https://www.freestyle.sh/) - Hosting

#### Runtime

- [Bun](https://bun.sh/) - Monorepo, runtime, bundler
- [Docker](https://www.docker.com/) - Container management

## Contributing

![image](https://github.com/user-attachments/assets/ecc94303-df23-46ae-87dc-66b040396e0b)

If you have a suggestion that would make this better, please fork the repo and
create a pull request. You can also
[open issues](https://github.com/Ludvig-Hedin/Weblab/issues).

See the [CONTRIBUTING.md](CONTRIBUTING.md) for instructions and code of conduct.

#### Contributors

<a href="https://github.com/Ludvig-Hedin/Weblab/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Ludvig-Hedin/Weblab" />
</a>

## Contact

![image](https://github.com/user-attachments/assets/60684b68-1925-4550-8efd-51a1509fc953)

- Team: [Discord](https://discord.gg/hERDfFZCsH) -
  [Twitter](https://twitter.com/weblab) -
  [LinkedIn](https://www.linkedin.com/company/weblab/) -
  [Email](mailto:contact@weblab.build)
- Project:
  [https://github.com/Ludvig-Hedin/Weblab](https://github.com/Ludvig-Hedin/Weblab)
- Website: [https://weblab.build](https://weblab.build)

## License

Distributed under the Apache 2.0 License. See [LICENSE.md](LICENSE.md) for more
information.

<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[contributors-shield]: https://img.shields.io/github/contributors/Ludvig-Hedin/Weblab.svg?style=for-the-badge
[contributors-url]: https://github.com/Ludvig-Hedin/Weblab/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Ludvig-Hedin/Weblab.svg?style=for-the-badge
[forks-url]: https://github.com/Ludvig-Hedin/Weblab/network/members
[stars-shield]: https://img.shields.io/github/stars/Ludvig-Hedin/Weblab.svg?style=for-the-badge
[stars-url]: https://github.com/Ludvig-Hedin/Weblab/stargazers
[issues-shield]: https://img.shields.io/github/issues/Ludvig-Hedin/Weblab.svg?style=for-the-badge
[issues-url]: https://github.com/Ludvig-Hedin/Weblab/issues
[license-shield]: https://img.shields.io/github/license/Ludvig-Hedin/Weblab.svg?style=for-the-badge
[license-url]: https://github.com/Ludvig-Hedin/Weblab/blob/master/LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?logo=linkedin&colorB=555
[linkedin-url]: https://www.linkedin.com/company/weblab
[twitter-shield]: https://img.shields.io/badge/-Twitter-black?logo=x&colorB=555
[twitter-url]: https://x.com/weblab
[discord-shield]: https://img.shields.io/badge/-Discord-black?logo=discord&colorB=555
[discord-url]: https://discord.gg/hERDfFZCsH
[React.js]: https://img.shields.io/badge/react-%2320232a.svg?logo=react&logoColor=%2361DAFB
[React-url]: https://reactjs.org/
[TailwindCSS]: https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Electron.js]: https://img.shields.io/badge/Electron-191970?logo=Electron&logoColor=white
[Electron-url]: https://www.electronjs.org/
[Vite.js]: https://img.shields.io/badge/vite-%23646CFF.svg?logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[product-screenshot]: assets/brand.png
[weave-shield]: https://img.shields.io/endpoint?url=https%3A%2F%2Fapp.workweave.ai%2Fapi%2Frepository%2Fbadge%2Forg_pWcXBHJo3Li2Te2Y4WkCPA33%2F820087727&cacheSeconds=3600&labelColor=#131313
[weave-url]: https://app.workweave.ai/reports/repository/org_pWcXBHJo3Li2Te2Y4WkCPA33/820087727
