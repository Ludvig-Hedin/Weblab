import { useLocale } from 'next-intl';

import en from '../../../messages/cloud-editor/en.json';
import sv from '../../../messages/cloud-editor/sv.json';

export function useCloudEditorCopy(): typeof en {
    return useLocale().startsWith('sv') ? sv : en;
}
