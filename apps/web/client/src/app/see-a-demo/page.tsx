import { redirect } from 'next/navigation';

// Demo CTAs are intentionally hidden across the product. Anyone hitting this
// route is sent straight to /projects.
export default function DemoOnlyPage() {
    redirect('/projects');
}
