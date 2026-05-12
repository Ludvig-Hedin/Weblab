/**
 * Extracts owner/repo from a GitHub URL. Lives in its own module (rather
 * than alongside the page-route helpers) so importing it does not drag the
 * @weblab/parser bundle into the landing-page client bundle via the create
 * manager's eager import chain.
 */
export const parseRepoUrl = (repoUrl: string): { owner: string; repo: string } => {
    const match = /github\.com\/([^/?#]+)\/([^/?#]+?)(?:\.git)?(?:[/?#]|$)/.exec(repoUrl);
    if (!match?.[1] || !match?.[2]) {
        throw new Error('Invalid GitHub URL');
    }

    return {
        owner: match[1],
        repo: match[2],
    };
};
