import { describe, expect, test } from 'bun:test';
import { ContentTextRenderMappingError, resolveContentTextRenderMapping } from './content-render-mapping';
import { ContentTextTargetError, replaceContentTextTarget } from './content-target';

// Prepared FAQ-chain syntax, OIDs and binding structure, with generic content.
// Unrelated imports have inert fixture modules; root separately verifies the complete real inventory.
const chain: Record<string, string> = {
    "src/content/home-faq.ts": "import type { ChatFaqItem } from \"@/components/sections/chat-faq\";\n\n// Stable records supplied by the site owner.\nexport const homeFaqItems: readonly ChatFaqItem[] = [\n  {\n    id: \"audience\",\n    question: \"Question 1?\",\n    answer: \"Answer for record 1.\",\n  },\n  {\n    id: \"general-tools\",\n    question: \"Question 2?\",\n    answer: \"Answer for record 2.\",\n  },\n  {\n    id: \"citations\",\n    question: \"Question 3?\",\n    answer: \"Answer for record 3.\",\n  },\n  {\n    id: \"privacy\",\n    question: \"Question 4?\",\n    answer: \"Answer for record 4.\",\n  },\n  {\n    id: \"search-firms\",\n    question: \"Question 5?\",\n    answer: \"Answer for record 5.\",\n  },\n  {\n    id: \"pricing\",\n    question: \"Question 6?\",\n    answer: \"Answer for record 6.\",\n  },\n];\n",
    "src/components/sections/home-faq.tsx": "import { homeFaqItems } from \"@/content/home-faq\";\nimport { ChatFaq } from \"./chat-faq\";\n\nexport function HomeFaq() {\n  return (\n    <ChatFaq\n      items={homeFaqItems}\n      weblabContentMapping=\"prepared-home-faq\"\n      eyebrowLead=\"FAQ\"\n      eyebrowTail=\"One-liner\"\n      heading={<>Common questions.<br data-oid=\"rlye17o\" />Plain answers.</>}\n      avatarSrc=\"/media/avatar.webp\" data-oid=\":4v84e6\" />);\n\n\n}",
    "src/components/sections/chat-faq.tsx": "\"use client\";\n\nimport * as AccordionPrimitive from \"@radix-ui/react-accordion\";\nimport Image from \"next/image\";\nimport { useId, useState, type ReactNode } from \"react\";\nimport { Accordion } from \"@/components/ui/accordion\";\nimport { cn } from \"@/lib/utils\";\nimport { ScrollReveal } from \"@/components/motion/scroll-reveal\";\nimport { SectionHeading } from \"./section-heading\";\nimport styles from \"./chat-faq.module.css\";\n\nexport type ChatFaqItem = {\n  id: string;\n  question: string;\n  answer: string;\n};\n\ntype ChatFaqProps = {\n  items: readonly ChatFaqItem[];\n  heading: ReactNode;\n  eyebrowLead: string;\n  eyebrowTail: string;\n  avatarSrc: string;\n  className?: string;\n  weblabContentMapping?: string;\n};\n\nexport function ChatFaq({ items, heading, eyebrowLead, eyebrowTail, avatarSrc, className, weblabContentMapping }: ChatFaqProps) {\n  const headingId = useId();\n  const [activeItem, setActiveItem] = useState(items[0]?.id ?? \"\");\n\n  if (!items.length) return null;\n\n  return (\n    <section className={cn(styles.root, className)} aria-labelledby={headingId} data-nav-theme=\"light\" data-oid=\"g5hp3:g\">\n      <div className={styles.divider} aria-hidden=\"true\" data-oid=\"gxqhbe_\" />\n      <SectionHeading headingId={headingId} heading={heading} eyebrowLead={eyebrowLead} eyebrowTail={eyebrowTail} data-oid=\"b2oagg:\" />\n      <ScrollReveal className={styles.reveal ?? \"\"} data-oid=\"o-y3lze\">\n      <Accordion type=\"single\" collapsible value={activeItem} onValueChange={setActiveItem} className={styles.list} data-oid=\"i_tm1cl\">\n        {items.map((item) => {\n            const isOpen = activeItem === item.id;\n            return (\n              <AccordionPrimitive.Item key={item.id} value={item.id} className={styles.item} data-oid=\"c0qa4k0\">\n              <AccordionPrimitive.Header className={styles.question} data-oid=\"cimc8_1\">\n                <AccordionPrimitive.Trigger className={styles.trigger} data-oid=\"s3flx9y\">\n                  <span className={styles.bubble} data-oid=\".vvfaph\" data-weblab-content-map={weblabContentMapping} data-weblab-content-item={item.id}>{item.question}</span>\n                  <span className={styles.avatar} aria-hidden=\"true\" data-oid=\"b_jio.2\">\n                    <Image src={avatarSrc} alt=\"\" width={28} height={28} sizes=\"28px\" unoptimized data-oid=\".t154wk\" />\n                  </span>\n                </AccordionPrimitive.Trigger>\n              </AccordionPrimitive.Header>\n              <AccordionPrimitive.Content forceMount className={styles.answer} aria-hidden={!isOpen} inert={!isOpen} data-oid=\"88.5v-4\">\n                <div className={styles.answerMotion} data-oid=\"d_nqqs-\">\n                <div className={styles.answerClip} data-oid=\"fei-fyn\">\n                  <div className={styles.answerBody} data-oid=\"qh9trq:\"><p data-oid=\"4f464se\" data-weblab-content-map={weblabContentMapping} data-weblab-content-item={item.id}>{item.answer}</p></div>\n                </div>\n                </div>\n              </AccordionPrimitive.Content>\n            </AccordionPrimitive.Item>);\n\n          })}\n      </Accordion>\n      </ScrollReveal>\n    </section>);\n\n}",
    "src/app/page.tsx": "import { HomeFaq } from \"@/components/sections/home-faq\";\nimport { Hero } from \"@/components/sections/hero\";\nimport { EvidenceOverview } from \"@/components/sections/evidence-overview\";\nimport { ProductModules } from \"@/components/sections/product-modules\";\nimport { TestimonialSlider } from \"@/components/sections/testimonial-slider\";\nimport { CoverageStats } from \"@/components/sections/coverage-stats\";\nimport { coverageStats, evidenceItems, productTabs, testimonialItems } from \"@/content/home\";\nimport { createMetadata, organizationJsonLd } from \"@/lib/seo\";\nimport { siteConfig } from \"@/config/site\";\n\nexport const metadata = createMetadata({\n  title: siteConfig.seo.title,\n  description: siteConfig.seo.description,\n  path: \"/\"\n});\n\nexport default function HomePage() {\n  return (\n    <main data-oid=\"45jl9sf\">\n      <Hero data-oid=\"d.f6yx2\" />\n      <EvidenceOverview items={evidenceItems} data-oid=\"tf-ev3f\" />\n      <TestimonialSlider items={testimonialItems} data-oid=\"-vx:rwr\" />\n      <ProductModules tabs={productTabs} data-oid=\"01i3rr-\" />\n      <CoverageStats items={coverageStats} data-oid=\"g1ug7u0\" />\n      <HomeFaq data-oid=\"ge98qit\" />\n      <script type=\"application/ld+json\" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} data-oid=\"ukrqr-:\" />\n    </main>);\n\n}"
};
const owner = 'src/content/home-faq.ts';
const wrapper = 'src/components/sections/home-faq.tsx';
const renderer = 'src/components/sections/chat-faq.tsx';
const homepage = 'src/app/page.tsx';
const mappingId = 'prepared-home-faq';
function fixture(): Record<string, string> {
    const files: Record<string, string> = { ...chain, 'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }) };
    for (const path of [
        'src/components/ui/accordion.tsx', 'src/lib/utils.ts', 'src/components/motion/scroll-reveal.tsx',
        'src/components/sections/section-heading.tsx', 'src/components/sections/chat-faq.module.css',
        'src/components/sections/hero.tsx', 'src/components/sections/evidence-overview.tsx',
        'src/components/sections/product-modules.tsx', 'src/components/sections/testimonial-slider.tsx',
        'src/components/sections/coverage-stats.tsx', 'src/content/home.ts', 'src/lib/seo.ts', 'src/config/site.ts',
    ]) files[path] = path.endsWith('.css') ? '' : 'export {};';
    return files;
}
function resolve(files = fixture(), oid = '4f464se', itemId = 'audience', mapping = mappingId) {
    return resolveContentTextRenderMapping({ files, oid, itemId, mappingId: mapping });
}
function refuses(files: Record<string, string>, code?: ContentTextRenderMappingError['code'] | ContentTextTargetError['code']) {
    let error: unknown;
    try { resolve(files); } catch (cause) { error = cause; }
    expect(error instanceof ContentTextRenderMappingError || error instanceof ContentTextTargetError).toBe(true);
    if (code) expect((error as ContentTextRenderMappingError | ContentTextTargetError).code).toBe(code);
}
function changed(path: string, from: string, to: string): Record<string, string> {
    const files = fixture();
    expect(files[path]).toContain(from);
    files[path] = files[path]!.replace(from, to);
    return files;
}

describe('prepared keyed FAQ render mapping', () => {
    test('resolves twelve identities to one data owner, with two renderer OIDs and six stable records', () => {
        const identities = new Set<string>();
        for (const itemId of ['audience', 'general-tools', 'citations', 'privacy', 'search-firms', 'pricing']) {
            for (const [oid, property] of [['.vvfaph', 'question'], ['4f464se', 'answer']] as const) {
                const result = resolve(fixture(), oid, itemId);
                expect(result.path).toBe(owner);
                expect(result.target).toEqual({ kind: 'data-leaf', exportName: 'homeFaqItems', itemId, property });
                expect(result.renderMapping).toEqual({ version: 1, kind: 'keyed-prop-map', mappingId,
                    callsite: { path: wrapper, exportName: 'HomeFaq', oid: ':4v84e6' },
                    renderer: { path: renderer, exportName: 'ChatFaq', oid } });
                expect(result.dependencies).toContain(homepage);
                identities.add(JSON.stringify(result.target));
            }
        }
        expect(identities.size).toBe(12);
    });
    test('changes only the addressed string and preserves the renderer, imports, IDs and sibling data', () => {
        const files = fixture(), result = resolve(files);
        const updated = replaceContentTextTarget(files[owner]!, result.target, result.value, 'Updated audience answer.');
        expect(updated).toBe(files[owner]!.replace(JSON.stringify(result.value), JSON.stringify('Updated audience answer.')));
        files[owner] = updated;
        expect(resolve(files).value).toBe('Updated audience answer.');
        expect(files[renderer]).toBe(chain[renderer]);
        const question = resolve(files, '.vvfaph');
        files[owner] = replaceContentTextTarget(files[owner]!, question.target, question.value, 'New question?');
        expect(resolve(files).target.itemId).toBe('audience');
        expect(resolve(files).value).toBe('Updated audience answer.');
        expect(resolve(files, '4f464se', 'pricing').value).toBe(resolve(fixture(), '4f464se', 'pricing').value);
    });
    test('accepts type-only consumers and pinned public bootstrap scripts without treating them as source modules', () => {
        const files = fixture();
        files['src/faq-types.ts'] = `import type { ChatFaqItem } from './components/sections/chat-faq'; export type Other = ChatFaqItem;`;
        files['public/weblab-preload-script.js'] = 'require("internal-bundle"); eval("bundled");';
        files['next-env.d.ts'] = 'import "./.next/dev/types/routes.d.ts";';
        expect(resolve(files).path).toBe(owner);
    });
    test('rejects missing, duplicated, mutable and transformed record identities', () => {
        refuses(changed(owner, 'id: "pricing"', 'id: "audience"'), 'DUPLICATE_ITEM_ID');
        refuses(changed(owner, 'id: "pricing",', ''), 'UNSUPPORTED_LIST');
        refuses(changed(owner, 'export const homeFaqItems', 'export let homeFaqItems'));
        refuses(changed(wrapper, 'items={homeFaqItems}', 'items={homeFaqItems.filter(Boolean)}'));
        refuses(changed(wrapper, 'items={homeFaqItems}', 'items={[...homeFaqItems]}'));
        refuses(changed(wrapper, 'items={homeFaqItems}', 'items={homeFaqItems.sort()}'));
        refuses(changed(owner, 'question: "Question 1?"', '["question"]: "Question 1?"'));
        const files = fixture(); files[owner] += '\nhomeFaqItems[0].id = "changed";'; refuses(files);
    });
    test('rejects extra consumers, imports through barrels and hidden resolution paths', () => {
        const routeConsumer = fixture();
        routeConsumer['src/app/other/page.tsx'] = 'import HomePage from "../page"; export default function Other() { return <HomePage />; }';
        refuses(routeConsumer, 'UNSUPPORTED_CONSUMER');
        for (const extra of [
            `import { homeFaqItems } from './content/home-faq'; console.log(homeFaqItems);`,
            `import { HomeFaq } from './components/sections/home-faq'; export const another = <HomeFaq />;`,
            `import { ChatFaq } from './components/sections/chat-faq'; export const another = <ChatFaq />;`,
            `export { homeFaqItems } from './content/home-faq';`,
            `export * from './content/home-faq';`,
            `const other = require('./content/home-faq');`,
            `const other = import('./content/' + name);`,
            `eval('hidden consumer');`,
        ]) { const files = fixture(); files['src/extra.tsx'] = extra; refuses(files, 'UNSUPPORTED_CONSUMER'); }
        refuses(changed(wrapper, 'import { homeFaqItems }', 'import * as homeFaqItems'));
        refuses(changed(wrapper, 'import { ChatFaq }', 'import { ChatFaq as Other }'));
    });
    test('rejects shadowing, aliases, extra item references and metadata from another binding', () => {
        refuses(changed(wrapper, 'export function HomeFaq() {', 'export function HomeFaq() { const homeFaqItems = [];'));
        refuses(changed(renderer, 'const isOpen = activeItem === item.id;', 'const isOpen = activeItem === item.id; const alias = item;'));
        refuses(changed(renderer, '{item.answer}', '{((item) => <p>{item.answer}</p>)(other)}'));
        refuses(changed(renderer, 'data-weblab-content-map={weblabContentMapping}', 'data-weblab-content-map={other}'));
        refuses(changed(renderer, 'data-weblab-content-item={item.id}', 'data-weblab-content-item={item.question}'));
        refuses(changed(renderer, 'key={item.id}', 'key={item.question}'));
        refuses(changed(renderer, 'value={item.id}', 'value={index}'));
        refuses(changed(renderer, 'if (!items.length)', 'const alias = items; if (!items.length)'));
        refuses(changed(renderer, 'export function ChatFaq({', 'export function ChatFaq({ items: renamed,'));
    });
    test('rejects non-native, mixed, conditional and overridden text leaves', () => {
        refuses(changed(renderer, '<p data-oid="4f464se"', '<p {...props} data-oid="4f464se"'));
        refuses(changed(renderer, '<p data-oid="4f464se"', '<p children="Override" data-oid="4f464se"'));
        refuses(changed(renderer, '{item.answer}', '{item.answer}<strong>extra</strong>'));
        refuses(changed(renderer, '{item.answer}', '{item["answer"]}'));
        refuses(changed(renderer, '{item.answer}', '{ready ? item.answer : ""}'));
        const custom = changed(renderer, '<p data-oid="4f464se"', '<Custom data-oid="4f464se"');
        custom[renderer] = custom[renderer]!.replace('{item.answer}</p>', '{item.answer}</Custom>');
        refuses(custom);
    });
    test('rejects absent modules, ambiguous paths, parse failures, duplicate OIDs and a second homepage mount', () => {
        const missing = fixture(); delete missing['src/lib/utils.ts']; refuses(missing, 'INCOMPLETE_INVENTORY');
        const ambiguous = fixture(); ambiguous['src/content/home-faq.tsx'] = chain[owner]!; refuses(ambiguous, 'AMBIGUOUS_IMPORT');
        const invalid = fixture(); invalid['src/unrelated.ts'] = 'export function {'; refuses(invalid, 'INVALID_SOURCE');
        const duplicate = fixture(); duplicate['src/other.tsx'] = '<p data-oid="4f464se">Other</p>'; refuses(duplicate, 'DUPLICATE_OID');
        refuses(changed(homepage, '<HomeFaq data-oid="ge98qit" />', '<HomeFaq data-oid="ge98qit" /><HomeFaq data-oid="another" />'));
        refuses(changed(homepage, 'data-oid="ge98qit"', 'data-oid="wrong-mount"'));
        const doubleMapping = fixture(); doubleMapping['src/duplicate.tsx'] = '<ChatFaq weblabContentMapping="prepared-home-faq" />'; refuses(doubleMapping, 'AMBIGUOUS_MAPPING');
    });
    test('rejects unknown instances and trailing-newline metadata identifiers', () => {
        expect(() => resolve(fixture(), '4f464se', 'missing')).toThrow('ITEM_NOT_FOUND');
        expect(() => resolve(fixture(), 'missing')).toThrow('INVALID_INSTANCE');
        expect(() => resolve(fixture(), '4f464se', 'audience', 'wrong-map')).toThrow('MAPPING_NOT_FOUND');
        expect(() => resolve(fixture(), '4f464se\n')).toThrow('INVALID_MAPPING');
        expect(() => resolve(fixture(), '4f464se', 'audience', 'prepared-home-faq\n')).toThrow('INVALID_MAPPING');
        expect(() => resolve(fixture(), '4f464se', 'audience\n')).toThrow('INVALID_MAPPING');
    });
});
