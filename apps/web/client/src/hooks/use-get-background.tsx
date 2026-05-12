import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

const createDark = '/assets/dunes-create-dark.png';
const createLight = '/assets/dunes-create-light.png';
const loginDark = '/assets/dunes-login-dark.png';
const loginLight = '/assets/dunes-login-light.png';

export const useGetBackground = (type: 'create' | 'login') => {
    const { resolvedTheme } = useTheme();
    // Default to dark assets matches the app's dark-first ThemeProvider; avoids
    // a flash to the light asset on first paint when resolvedTheme is undefined.
    const [backgroundImage, setBackgroundImage] = useState<string>(
        type === 'login' ? loginDark : createDark,
    );

    useEffect(() => {
        if (!resolvedTheme) return;
        const isDark = resolvedTheme === 'dark';
        const images = {
            create: isDark ? createDark : createLight,
            login: isDark ? loginDark : loginLight,
        };
        setBackgroundImage(images[type]);
    }, [resolvedTheme, type]);
    return backgroundImage;
};
