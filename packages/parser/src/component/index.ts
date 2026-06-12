export {
    componentKeyFor,
    discoverComponentsInAst,
    discoverComponentsInFile,
    isPascalCase,
} from './discover';
export {
    createPropFromElement,
    parseInstancePropValues,
    type CreatablePropKind,
    type CreatePropParams,
    type CreatePropResult,
} from './props';
export {
    extractComponent,
    suggestPropExtractions,
    type ExtractComponentParams,
    type ExtractComponentResult,
    type PropExtraction,
} from './extract';
export {
    addVariant,
    addVariantProp,
    removeVariant,
    updateVariantClasses,
    type VariantOpResult,
} from './variants';
export { detachInstance, type DetachParams, type DetachResult } from './detach';
export {
    ATTR_COMPONENT,
    ATTR_IF,
    ATTR_INSTANCE,
    ATTR_PROPS,
    ATTR_SLOT_CONTENT,
    detachInstanceHtml,
    extractHtmlComponent,
    findInstancesInPage,
    HTML_COMPONENT_DIR,
    parseComponentManifest,
    restampPage,
    stampInstance,
    stripComponentMarkers,
    type HtmlInstance,
    type HtmlPropValue,
} from './html/stamp';
