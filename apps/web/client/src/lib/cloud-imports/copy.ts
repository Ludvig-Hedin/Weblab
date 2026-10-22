import { useLocale } from 'next-intl';
import en from '../../../messages/cloud-imports/en.json';
import sv from '../../../messages/cloud-imports/sv.json';

export function useCloudImportCopy(): typeof en { return useLocale().startsWith('sv') ? sv : en; }
