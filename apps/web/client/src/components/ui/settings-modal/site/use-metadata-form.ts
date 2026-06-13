import { useEffect, useMemo, useState } from 'react';

import type { PageMetadata, TitleMetadata } from '@weblab/models';

interface UseMetadataFormProps {
    initialMetadata?: PageMetadata;
    defaultTitle?: string;
}

const extractTitleFromMetadata = (
    title: string | TitleMetadata | undefined,
    fallback: string,
): TitleMetadata => {
    if (!title) {
        return { default: fallback };
    }

    if (typeof title === 'string') {
        return { default: title };
    }

    return title;
};

const createTitleString = (titleObj: TitleMetadata): string => {
    return titleObj.absolute || titleObj.default || titleObj.template || '';
};

export const useMetadataForm = ({
    initialMetadata,
    defaultTitle = 'Title',
}: UseMetadataFormProps) => {
    const initialTitle = useMemo(() => initialMetadata?.title, [initialMetadata?.title]);
    const initialDesc = useMemo(() => initialMetadata?.description, [initialMetadata?.description]);

    const initialTitleObj = useMemo(
        () => extractTitleFromMetadata(initialTitle, defaultTitle),
        [initialTitle, defaultTitle],
    );

    const isSimpleTitle = typeof initialTitle === 'string' || !initialTitle;

    const [titleObject, setTitleObject] = useState<TitleMetadata>(initialTitleObj);
    // Seed with the saved description or '' — NOT `defaultDescription`. The
    // default is a helper sentence ("This is the information that will show up
    // on search engines…") meant only as a placeholder; seeding the state with
    // it caused that sentence to be saved as the page's real meta/OG
    // description. Empty-string keeps parity with the title's empty semantics
    // and lets the placeholder render via the form's own DEFAULT_DESCRIPTION.
    const [description, setDescription] = useState(initialDesc ?? '');
    const [isDirty, setIsDirty] = useState(false);
    const [uploadedImage, setUploadedImage] = useState<File | null>(null);

    const title = createTitleString(titleObject);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setTitleObject((prev) => ({ ...prev, default: newValue }));
        setIsDirty(true);
    };

    const handleTitleTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setTitleObject((prev) => ({ ...prev, template: newValue }));
        setIsDirty(true);
    };

    const handleTitleAbsoluteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setTitleObject((prev) => ({ ...prev, absolute: newValue }));
        setIsDirty(true);
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setDescription(e.target.value);
        setIsDirty(true);
    };

    const handleImageSelect = (file: File) => {
        setUploadedImage(file);
        setIsDirty(true);
    };

    const handleDiscard = () => {
        setTitleObject(initialTitleObj);
        setDescription(initialDesc ?? '');
        setUploadedImage(null);
        setIsDirty(false);
    };

    useEffect(() => {
        setTitleObject(initialTitleObj);
        setDescription(initialDesc ?? '');
    }, [initialTitleObj, initialDesc]);

    const getFinalTitleMetadata = (): string | TitleMetadata => {
        if (isSimpleTitle) {
            return titleObject.default || '';
        }

        if (titleObject.default && !titleObject.template && !titleObject.absolute) {
            return titleObject.default;
        }

        if (titleObject.template || titleObject.absolute) {
            return titleObject;
        }

        return titleObject.default || '';
    };

    return {
        title,
        titleObject,
        description,
        isDirty,
        uploadedImage,
        isSimpleTitle,
        handleTitleChange,
        handleTitleTemplateChange,
        handleTitleAbsoluteChange,
        handleDescriptionChange,
        handleImageSelect,
        handleDiscard,
        setTitle: (value: string) => {
            setTitleObject((prev) => ({ ...prev, default: value }));
        },
        setDescription,
        setIsDirty,
        getFinalTitleMetadata,
    };
};
