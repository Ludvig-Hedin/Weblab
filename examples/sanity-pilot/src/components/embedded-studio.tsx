'use client';

import { NextStudio } from 'next-sanity/studio';

import { createStudioConfig } from '../../sanity/config';
import type { StudioConnection } from '../lib/studio-config';

export function EmbeddedStudio(connection: StudioConnection) {
    return <NextStudio config={createStudioConfig(connection)} />;
}
