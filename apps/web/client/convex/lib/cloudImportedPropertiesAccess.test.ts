import { describe, expect, it } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import { canUseImportedProperties } from './cloudImportedAccess';

const gates = ['WEBLAB_CLOUD_EDITOR_ENABLED', 'WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED', 'WEBLAB_CLOUD_IMPORTED_PROPERTIES_ENABLED'] as const;
describe('imported property capability', () => {
    it('requires every rollout gate, a current role and prepared authority', () => {
        const previous = gates.map(key => process.env[key]);
        const authority = { preparationId: 'preparation' as Id<'cloudEditorImportPreparations'>, designRevision: 2 };
        try {
            gates.forEach(key => { process.env[key] = 'true'; });
            expect(canUseImportedProperties('content', authority)).toBe(true);
            expect(canUseImportedProperties('designer', authority)).toBe(true);
            expect(canUseImportedProperties(null, authority)).toBe(false);
            expect(canUseImportedProperties('content', null)).toBe(false);
            for (const key of gates) {
                process.env[key] = 'false';
                expect(canUseImportedProperties('content', authority)).toBe(false);
                process.env[key] = 'true';
            }
        } finally {
            gates.forEach((key, index) => {
                const value = previous[index];
                if (value === undefined) delete process.env[key]; else process.env[key] = value;
            });
        }
    });
});
