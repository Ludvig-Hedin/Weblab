import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { useCreateManager } from '@/components/store/create';

interface CreateErrorProps {
    onRetry?: () => void;
}

export const CreateError = observer(({ onRetry }: CreateErrorProps = {}) => {
    const createManager = useCreateManager();
    const error = createManager.error;
    const t = useTranslations('landing.hero.errorBanner');

    const handleClick = () => {
        // Wrap the observable write so MobX's `enforceActions: 'always'`
        // doesn't log a "modified outside an action" warning on every retry.
        runInAction(() => {
            createManager.error = null;
        });
        onRetry?.();
    };

    return (
        <motion.div
            className="border-destructive bg-destructive/20 text-destructive mt-2 flex max-w-xl items-center gap-3 rounded-xl border p-2 px-4 text-sm"
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={
                error ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(4px)' }
            }
            transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
            style={{
                willChange: 'opacity, filter',
                transform: 'translateZ(0)',
                display: error ? 'flex' : 'none',
            }}
        >
            <span className="flex-1 text-center">{error}</span>
            <button
                type="button"
                onClick={handleClick}
                className="border-destructive/60 text-destructive hover:bg-destructive/20 cursor-pointer rounded-md border px-2 py-1 text-xs font-medium transition-colors"
            >
                {onRetry ? t('tryAgain') : t('dismiss')}
            </button>
        </motion.div>
    );
});
