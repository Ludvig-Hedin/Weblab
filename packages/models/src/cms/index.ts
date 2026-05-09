export enum CmsFieldType {
    TEXT = 'text',
    RICH_TEXT = 'rich_text',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
    DATE = 'date',
    IMAGE = 'image',
    SLUG = 'slug',
    OPTION = 'option',
    REFERENCE = 'reference',
}

export enum CmsItemStatus {
    DRAFT = 'draft',
    PUBLISHED = 'published',
}

export enum CmsSourceType {
    WEBLAB = 'weblab',
    PAYLOAD = 'payload',
    STRAPI = 'strapi',
    REST = 'rest',
}

export enum CmsBindingKind {
    ITEM_FIELD = 'item-field',
    FIRST_FIELD = 'first-field',
    REPEAT = 'repeat',
    CURRENT_FIELD = 'current-field',
    /** v4: bind to a field of the item resolved from the page's URL (when
     *  the page is registered as a collection page). */
    PAGE_ITEM_FIELD = 'page-item-field',
}

/**
 * Filter operations supported on FIRST_FIELD and REPEAT bindings (v4).
 * Evaluated client-side against `item.values[fieldKey]` in the preload
 * script. Logic is AND across clauses; OR support is deferred.
 */
export type CmsFilterOp =
    | 'eq'
    | 'neq'
    | 'before'
    | 'after'
    | 'contains'
    | 'starts_with'
    | 'is_set'
    | 'is_unset';

export type CmsFilterClause =
    | { fieldKey: string; op: 'eq' | 'neq'; value: string | number | boolean }
    | { fieldKey: string; op: 'before' | 'after'; value: string }
    | { fieldKey: string; op: 'contains' | 'starts_with'; value: string }
    | { fieldKey: string; op: 'is_set' | 'is_unset' };

/**
 * Discriminated union describing how a single canvas element resolves CMS
 * data at preview/publish time.
 *
 * - ITEM_FIELD: bind to a specific field of a specific item.
 * - FIRST_FIELD: bind to a field of the first item that matches the
 *   collection's order/filters. Used for placeholders and "latest blog
 *   post" patterns.
 * - REPEAT: marks the element as a repeating list. Children render once
 *   as a template and are cloned per item at preview time.
 * - CURRENT_FIELD: only valid inside a REPEAT subtree; resolves against
 *   the cloned item's values.
 * - PAGE_ITEM_FIELD (v4): only valid on a page registered as a collection
 *   page. Resolves against the item identified by the URL slug at preview
 *   time, or an editor-picked item.
 */
export type CmsBindingPayload =
    | {
          kind: CmsBindingKind.ITEM_FIELD;
          collectionId: string;
          itemId: string;
          fieldKey: string;
      }
    | {
          kind: CmsBindingKind.FIRST_FIELD;
          collectionId: string;
          fieldKey: string;
          filters?: CmsFilterClause[];
          /** Combine clauses with `and` (default) or `or`. */
          filterMode?: 'and' | 'or';
      }
    | {
          kind: CmsBindingKind.REPEAT;
          collectionId: string;
          sort?: { fieldKey: string; direction: 'asc' | 'desc' };
          limit?: number;
          filters?: CmsFilterClause[];
          filterMode?: 'and' | 'or';
      }
    | {
          kind: CmsBindingKind.CURRENT_FIELD;
          fieldKey: string;
      }
    | {
          kind: CmsBindingKind.PAGE_ITEM_FIELD;
          fieldKey: string;
      };
