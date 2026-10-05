export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="font-semibold text-5xl tracking-tight">Hello, world</h1>
      <p className="mt-6 text-lg text-neutral-600">
        This is your new website. Click anything to change it.
      </p>
      <a
        className="mt-10 inline-block rounded-md bg-neutral-900 px-5 py-3 text-white"
        href="mailto:hello@example.com"
      >
        Get in touch
      </a>
    </main>
  );
}
