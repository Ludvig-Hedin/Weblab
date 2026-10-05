import { expect, test } from 'bun:test';
import { privateCredentialPath, privateCopyExclusion } from './private-path-policy';

test('credential files, shell environment loaders and cloud config are excluded at every depth', () => {
    for (const file of ['.env', 'site/.ENV.production', '.envrc', '.env.example', '.npmrc',
        '.config/gcloud/application_default_credentials.json', '.ssh/config', '.aws/config', '.docker/config.json',
        'nested/client.pem', 'firebase-adminsdk-secret.json', '.claude/settings.json',
        'secrets.production.json', 'credentials.production.json', '.git-credentials']) {
        expect(privateCredentialPath(file)).toBe(true);
        expect(privateCopyExclusion(file)).toBe('credentials');
    }
});

test('ordinary source and Git retain their identity while dependencies and old build output stay separate', () => {
    for (const file of ['app/page.tsx', 'app/environment.ts', 'app/credentials.ts', 'app/secrets.ts', 'public/logo.png', '.git/config', '.git/objects/ab/cd', '.github/workflows/deploy.yml']) {
        expect(privateCopyExclusion(file)).toBeNull();
    }
    expect(privateCopyExclusion('node_modules/next/package.json')).toBe('dependencies');
    expect(privateCopyExclusion('.next/server/app/page.js')).toBe('generated');
});
