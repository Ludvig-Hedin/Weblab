import type { DropElementProperties } from '@weblab/models/element';
import type { Icons } from '@weblab/ui/icons';

export type IconKey = keyof typeof Icons;

export type PresetCategory = 'structure' | 'basic' | 'typography' | 'media' | 'forms' | 'advanced';

export interface ElementPreset {
    key: string;
    label: string;
    description?: string;
    icon: IconKey;
    category: PresetCategory;
    comingSoon?: boolean;
    properties: DropElementProperties;
}

export const PRESET_CATEGORIES: { value: PresetCategory; label: string }[] = [
    { value: 'structure', label: 'Structure' },
    { value: 'basic', label: 'Basic' },
    { value: 'typography', label: 'Typography' },
    { value: 'media', label: 'Media' },
    { value: 'forms', label: 'Forms' },
    { value: 'advanced', label: 'Advanced' },
];

export const PLACEHOLDER_IMAGE_SRC =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
            <rect width="640" height="400" fill="#E5E7EB" />
            <rect x="80" y="80" width="480" height="240" rx="24" fill="#CBD5E1" />
            <path d="M170 270 275 165l60 60 95-95 120 140H170Z" fill="#94A3B8" />
            <circle cx="255" cy="160" r="28" fill="#F8FAFC" />
        </svg>`,
    );

const STUB_PROPERTIES: DropElementProperties = {
    tagName: 'div',
    textContent: null,
    styles: {},
};

export const ELEMENT_PRESETS: ElementPreset[] = [
    // Structure
    {
        key: 'section',
        label: 'Section',
        description: 'Full-width content section',
        icon: 'Section',
        category: 'structure',
        properties: {
            tagName: 'section',
            textContent: null,
            styles: {
                width: '100%',
                minHeight: '220px',
                padding: '40px',
                borderRadius: '28px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
            },
        },
    },
    {
        key: 'container',
        label: 'Container',
        description: 'Centered max-width wrapper',
        icon: 'Frame',
        category: 'structure',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                width: '100%',
                maxWidth: '1120px',
                marginLeft: 'auto',
                marginRight: 'auto',
                padding: '24px',
            },
        },
    },
    {
        key: 'v-flex',
        label: 'V Flex',
        description: 'Vertical flex stack',
        icon: 'AlignLeft',
        category: 'structure',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '16px',
                width: '240px',
                minHeight: '140px',
                borderRadius: '12px',
                border: '1px dashed #CBD5E1',
            },
        },
    },
    {
        key: 'h-flex',
        label: 'H Flex',
        description: 'Horizontal flex row',
        icon: 'AlignTop',
        category: 'structure',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                display: 'flex',
                flexDirection: 'row',
                gap: '12px',
                padding: '16px',
                minHeight: '120px',
                width: '100%',
                borderRadius: '12px',
                border: '1px dashed #CBD5E1',
            },
        },
    },
    {
        key: 'grid',
        label: 'Grid',
        description: '12-column grid layout',
        icon: 'LayoutMasonry',
        category: 'structure',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                display: 'grid',
                gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                gap: '16px',
                padding: '16px',
                width: '100%',
                minHeight: '160px',
                borderRadius: '12px',
                border: '1px dashed #CBD5E1',
            },
        },
    },
    {
        key: 'columns',
        label: 'Columns',
        description: 'Two-column layout',
        icon: 'BorderAll',
        category: 'structure',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '24px',
                padding: '16px',
                width: '100%',
                minHeight: '160px',
                borderRadius: '12px',
                border: '1px dashed #CBD5E1',
            },
        },
    },

    // Basic
    {
        key: 'div',
        label: 'Div',
        description: 'Generic layout block',
        icon: 'Square',
        category: 'basic',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                width: '220px',
                height: '140px',
                borderRadius: '20px',
                backgroundColor: '#E0F2FE',
                border: '1px solid #7DD3FC',
            },
        },
    },
    {
        key: 'button',
        label: 'Button',
        description: 'Clickable call to action',
        icon: 'Button',
        category: 'basic',
        properties: {
            tagName: 'button',
            textContent: 'Button',
            styles: {
                padding: '14px 22px',
                borderRadius: '9999px',
                backgroundColor: '#111827',
                color: '#FFFFFF',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
            },
        },
    },
    {
        key: 'link-block',
        label: 'Link Block',
        description: 'Wrap content in a link',
        icon: 'Link',
        category: 'basic',
        properties: {
            tagName: 'a',
            textContent: null,
            styles: {
                display: 'inline-flex',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                textDecoration: 'none',
                color: '#0F172A',
                minWidth: '120px',
                minHeight: '48px',
            },
            attributes: {
                href: '#',
            },
        },
    },
    {
        key: 'list',
        label: 'List',
        description: 'Unordered list',
        icon: 'ListBullet',
        category: 'basic',
        properties: {
            tagName: 'ul',
            textContent: null,
            styles: {
                paddingLeft: '20px',
                lineHeight: '1.8',
                color: '#374151',
            },
        },
    },
    {
        key: 'list-item',
        label: 'List Item',
        description: 'Item inside a list',
        icon: 'ListCheck',
        category: 'basic',
        properties: {
            tagName: 'li',
            textContent: 'List item',
            styles: {
                fontSize: '16px',
                color: '#374151',
            },
        },
    },

    // Typography
    {
        key: 'heading-h1',
        label: 'Heading 1',
        description: 'Largest page heading',
        icon: 'H1',
        category: 'typography',
        properties: {
            tagName: 'h1',
            textContent: 'Heading 1',
            styles: {
                fontSize: '56px',
                lineHeight: '1.05',
                fontWeight: '700',
                color: '#0F172A',
                letterSpacing: '-0.02em',
            },
        },
    },
    {
        key: 'heading-h2',
        label: 'Heading 2',
        description: 'Section heading',
        icon: 'H2',
        category: 'typography',
        properties: {
            tagName: 'h2',
            textContent: 'Heading 2',
            styles: {
                fontSize: '40px',
                lineHeight: '1.1',
                fontWeight: '700',
                color: '#111827',
            },
        },
    },
    {
        key: 'heading-h3',
        label: 'Heading 3',
        description: 'Subsection heading',
        icon: 'H3',
        category: 'typography',
        properties: {
            tagName: 'h3',
            textContent: 'Heading 3',
            styles: {
                fontSize: '28px',
                lineHeight: '1.2',
                fontWeight: '600',
                color: '#111827',
            },
        },
    },
    {
        key: 'paragraph',
        label: 'Paragraph',
        description: 'Body copy block',
        icon: 'Text',
        category: 'typography',
        properties: {
            tagName: 'p',
            textContent: 'Add your paragraph text here.',
            styles: {
                fontSize: '18px',
                lineHeight: '1.6',
                color: '#374151',
                maxWidth: '560px',
            },
        },
    },
    {
        key: 'text-link',
        label: 'Text Link',
        description: 'Inline anchor',
        icon: 'Link',
        category: 'typography',
        properties: {
            tagName: 'a',
            textContent: 'Link text',
            styles: {
                color: '#2563EB',
                textDecoration: 'underline',
                fontSize: '16px',
            },
            attributes: {
                href: '#',
            },
        },
    },
    {
        key: 'text-block',
        label: 'Text Block',
        description: 'Inline span',
        icon: 'Text',
        category: 'typography',
        properties: {
            tagName: 'span',
            textContent: 'Text block',
            styles: {
                fontSize: '16px',
                color: '#374151',
            },
        },
    },
    {
        key: 'block-quote',
        label: 'Block Quote',
        description: 'Pull quote',
        icon: 'ChatBubble',
        category: 'typography',
        properties: {
            tagName: 'blockquote',
            textContent: 'A memorable quote.',
            styles: {
                borderLeft: '3px solid #94A3B8',
                paddingLeft: '20px',
                fontSize: '20px',
                fontStyle: 'italic',
                color: '#334155',
                margin: '0',
            },
        },
    },
    {
        key: 'rich-text',
        label: 'Rich Text',
        description: 'Editable text region',
        icon: 'Text',
        category: 'typography',
        properties: {
            tagName: 'div',
            textContent: 'Rich text content',
            styles: {
                fontSize: '16px',
                lineHeight: '1.6',
                color: '#374151',
                padding: '12px',
                borderRadius: '8px',
                border: '1px dashed #CBD5E1',
                minWidth: '320px',
            },
        },
    },

    // Media
    {
        key: 'image',
        label: 'Image',
        description: 'Placeholder image block',
        icon: 'Image',
        category: 'media',
        properties: {
            tagName: 'img',
            textContent: null,
            styles: {
                width: '320px',
                height: '220px',
                objectFit: 'cover',
                borderRadius: '24px',
                backgroundColor: '#E5E7EB',
            },
            attributes: {
                src: PLACEHOLDER_IMAGE_SRC,
                alt: 'Placeholder image',
            },
        },
    },
    {
        key: 'video',
        label: 'Video',
        description: 'HTML5 video player',
        icon: 'Video',
        category: 'media',
        properties: {
            tagName: 'video',
            textContent: null,
            styles: {
                width: '480px',
                height: '270px',
                borderRadius: '16px',
                backgroundColor: '#0F172A',
            },
            attributes: {
                controls: '',
                playsinline: '',
            },
        },
    },
    {
        key: 'youtube',
        label: 'YouTube',
        description: 'Embed a YouTube video',
        icon: 'Play',
        category: 'media',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'lottie',
        label: 'Lottie',
        description: 'Lottie animation',
        icon: 'Play',
        category: 'media',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'spline',
        label: 'Spline',
        description: '3D scene',
        icon: 'Cube',
        category: 'media',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'rive',
        label: 'Rive',
        description: 'Rive animation',
        icon: 'Play',
        category: 'media',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },

    // Forms
    {
        key: 'input',
        label: 'Input',
        description: 'Text input field',
        icon: 'Input',
        category: 'forms',
        properties: {
            tagName: 'input',
            textContent: null,
            styles: {
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                width: '240px',
            },
            attributes: {
                type: 'text',
                placeholder: 'Type here…',
            },
        },
    },
    {
        key: 'checkbox',
        label: 'Checkbox',
        description: 'Boolean toggle',
        icon: 'Checkbox',
        category: 'forms',
        properties: {
            tagName: 'input',
            textContent: null,
            styles: {
                width: '16px',
                height: '16px',
            },
            attributes: {
                type: 'checkbox',
            },
        },
    },
    {
        key: 'form-block',
        label: 'Form',
        description: 'Form wrapper',
        icon: 'Frame',
        category: 'forms',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'label',
        label: 'Label',
        description: 'Form field label',
        icon: 'Text',
        category: 'forms',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'textarea',
        label: 'Text Area',
        description: 'Multiline text input',
        icon: 'Input',
        category: 'forms',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'radio',
        label: 'Radio',
        description: 'Single-choice option',
        icon: 'Circle',
        category: 'forms',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'select',
        label: 'Select',
        description: 'Dropdown picker',
        icon: 'DropdownMenu',
        category: 'forms',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'form-button',
        label: 'Submit',
        description: 'Form submit button',
        icon: 'Button',
        category: 'forms',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },

    // Advanced
    {
        key: 'navbar',
        label: 'Navbar',
        description: 'Navigation bar',
        icon: 'AlignTop',
        category: 'advanced',
        properties: {
            tagName: 'nav',
            textContent: null,
            styles: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                width: '100%',
                borderBottom: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
            },
        },
    },
    {
        key: 'dropdown',
        label: 'Dropdown',
        description: 'Dropdown menu shell',
        icon: 'DropdownMenu',
        category: 'advanced',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                padding: '8px',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                boxShadow: '0 6px 20px rgba(15, 23, 42, 0.08)',
                minWidth: '220px',
                minHeight: '160px',
            },
        },
    },
    {
        key: 'modal',
        label: 'Modal',
        description: 'Centered modal shell',
        icon: 'Frame',
        category: 'advanced',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                position: 'relative',
                padding: '32px',
                borderRadius: '20px',
                backgroundColor: '#FFFFFF',
                boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
                maxWidth: '480px',
                minHeight: '240px',
            },
        },
    },
    {
        key: 'search',
        label: 'Search',
        description: 'Search input',
        icon: 'MagnifyingGlass',
        category: 'advanced',
        properties: {
            tagName: 'input',
            textContent: null,
            styles: {
                padding: '10px 14px',
                borderRadius: '9999px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                width: '280px',
                backgroundColor: '#F8FAFC',
            },
            attributes: {
                type: 'search',
                placeholder: 'Search…',
            },
        },
    },
    {
        key: 'cms-list',
        label: 'CMS List',
        description: 'Repeats once per CMS item',
        icon: 'ListBullet',
        category: 'advanced',
        properties: {
            tagName: 'div',
            textContent: null,
            styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '16px',
                width: '320px',
                minHeight: '120px',
                borderRadius: '12px',
                border: '1px dashed #CBD5E1',
            },
            attributes: { 'data-weblab-list': '' },
        },
    },
    {
        key: 'code-embed',
        label: 'Code Embed',
        description: 'Custom HTML/JS',
        icon: 'Code',
        category: 'advanced',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'tabs',
        label: 'Tabs',
        description: 'Tabbed interface',
        icon: 'Layout',
        category: 'advanced',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'map',
        label: 'Map',
        description: 'Map embed',
        icon: 'Globe',
        category: 'advanced',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
    {
        key: 'custom',
        label: 'Custom',
        description: 'Custom element',
        icon: 'Code',
        category: 'advanced',
        comingSoon: true,
        properties: STUB_PROPERTIES,
    },
];
