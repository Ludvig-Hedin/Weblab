import { useTranslations } from 'next-intl';

import { vujahdayScript } from '../../fonts';

export function ObsessForHoursSection() {
    const t = useTranslations('landing.obsessForHours');
    return (
        <div className="bg-background-weblab/80 mx-auto flex w-full flex-col items-start gap-16 px-4 py-24 sm:gap-24 sm:px-6 md:gap-12 md:px-8 md:py-32 md:flex-row md:gap-12">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-12">
                {/* Responsive heading */}
                <div className="mb-12 flex w-full flex-col items-center justify-center md:flex-row md:gap-1">
                    {/* Desktop: all in a row, no stacking */}
                    <span className="text-foreground-primary text-5xl leading-[1.1] font-light">
                        {t('buildIn')}
                    </span>
                    <span
                        className={`text-foreground-primary ${vujahdayScript.className} mt-2 text-6xl leading-[1.1] font-light md:mt-0 md:mr-3 md:ml-3`}
                    >
                        {t('seconds')}
                    </span>
                    <span className="text-foreground-primary font-ultraLight mx-8 hidden text-5xl leading-[1.1] md:inline-block">
                        –
                    </span>
                    <span className="text-foreground-primary hidden text-5xl leading-[1.1] font-light md:ml-3 md:block">
                        {t('obsessFor')}
                    </span>
                    <span
                        className={`text-foreground-primary ${vujahdayScript.className} hidden text-6xl leading-[1.1] font-light md:mt-0 md:ml-0 md:block`}
                    >
                        {t('hours')}
                    </span>
                    {/* Mobile: stack, no dash */}
                    <div className="mt-8 flex w-full flex-col items-center text-center md:hidden">
                        <span className="text-foreground-primary text-5xl leading-[1.1] font-light">
                            {t('obsessFor')}
                        </span>
                        <span
                            className={`text-foreground-primary ${vujahdayScript.className} mt-2 text-6xl leading-[1.1] font-light`}
                        >
                            {t('hours')}
                        </span>
                    </div>
                </div>
                {/* Subtext blocks */}
                <div className="flex w-full flex-1 flex-col justify-between gap-12 md:flex-row md:gap-24">
                    <div className="flex w-full flex-col gap-6 text-center">
                        <p className="text-foreground-primary text-title3">{t('aiHeading')}</p>
                        <p className="text-foreground-secondary text-regular text-balance">
                            {t('aiBody')}
                        </p>
                    </div>
                    <div className="flex w-full flex-col gap-6 text-center">
                        <p className="text-foreground-primary text-title3">{t('designHeading')}</p>
                        <p className="text-foreground-secondary text-regular text-balance">
                            {t('designBody')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
