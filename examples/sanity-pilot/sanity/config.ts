import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';

import copy from '../src/lib/copy.json';
import { HOME_DOCUMENT_ID } from '../src/lib/content-validation';
import type { StudioConnection } from '../src/lib/studio-config';
import { schemaTypes } from './schema';

export function createStudioConfig(connection: StudioConnection) {
    return defineConfig({
        ...connection,
        name: 'pilot',
        title: copy.studioTitle,
        basePath: '/studio',
        plugins: [
            structureTool({
                structure: (S) =>
                    S.list()
                        .title(copy.studioTitle)
                        .items([
                            S.listItem()
                                .id('home')
                                .title(copy.homeTitle)
                                .child(
                                    S.document()
                                        .schemaType('pilotHome')
                                        .documentId(HOME_DOCUMENT_ID),
                                ),
                            S.documentTypeListItem('pilotPost').title(copy.postTitle),
                        ]),
            }),
        ],
        schema: {
            types: schemaTypes,
            templates: (templates) =>
                templates.filter((template) => template.schemaType !== 'pilotHome'),
        },
        document: {
            newDocumentOptions: (options) =>
                options.filter((option) => option.templateId !== 'pilotHome'),
            actions: (actions, context) =>
                context.schemaType === 'pilotHome'
                    ? actions.filter((action) =>
                          ['publish', 'discardChanges', 'restore'].includes(action.action ?? ''),
                      )
                    : actions,
        },
    });
}
