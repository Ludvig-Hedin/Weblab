import { ProjectChooserCards } from '../_components/project-chooser-cards';
import { TopBar } from '../_components/top-bar';

const Page = () => (
    <div className="bg-background flex h-screen w-screen flex-col">
        <TopBar />
        <div className="relative flex-1 overflow-y-auto">
            <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-6 py-10 select-none">
                <h1 className="text-foreground text-3xl font-medium tracking-tight">
                    Start a new project
                </h1>
                <ProjectChooserCards />
            </div>
        </div>
    </div>
);

export default Page;
