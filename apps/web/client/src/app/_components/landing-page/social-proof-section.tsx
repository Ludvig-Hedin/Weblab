import { useTranslations } from 'next-intl';

export function SocialProofSection() {
    const t = useTranslations('landing.socialProof');
    return (
        <div className="mx-auto w-full max-w-6xl px-8 py-16">
            <div className="text-center">
                <h2 className="heading-style-h4 text-foreground-primary mb-8">{t('title')}</h2>
                <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-2">
                    <div>
                        <div className="text-foreground-primary mb-2 text-2xl font-light">
                            {t('contributorsCount')}
                        </div>
                        <div className="text-foreground-secondary text-regular">
                            {t('contributorsLabel')}
                        </div>
                    </div>
                    <div>
                        <div className="text-foreground-primary mb-2 text-2xl font-light">
                            {t('openSource')}
                        </div>
                        <div className="text-foreground-secondary text-regular">
                            {t('transparent')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
