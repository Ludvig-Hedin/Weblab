export type GitHubRepo = {
    id: number;
    full_name: string;
    private: boolean;
    updated_at?: string | null;
};

// Most recently active first; ties broken alphabetically. The GitHub API
// returns installation repos in an unstable order, so sort client-side.
export const sortRepos = (list: GitHubRepo[]): GitHubRepo[] =>
    [...list].sort((a, b) => {
        const at = a.updated_at ? Date.parse(a.updated_at) : 0;
        const bt = b.updated_at ? Date.parse(b.updated_at) : 0;
        if (bt !== at) return bt - at;
        return a.full_name.localeCompare(b.full_name);
    });
