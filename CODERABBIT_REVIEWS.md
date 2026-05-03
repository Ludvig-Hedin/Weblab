CODERABBIT_REVIEWS.md

File: apps/web/client/src/components/blogpost1.tsx
Line: 49
Type: potential_issue
Comment:
Missing alt attribute on AvatarImage.
The AvatarImage component should have an alt attribute for accessibility. Screen readers need this to describe the image.
♿ Proposed fix
-                
+
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/blogpost1.tsx at line 49, AvatarImage is missing an alt attribute which harms accessibility; update the JSX where AvatarImage is rendered (the AvatarImage component usage) to include an alt prop—e.g., alt={author.name ? Avatar of ${author.name} : 'Author avatar'}—and, if necessary, update the AvatarImage prop types/props signature (prop name alt: string) so the component accepts and forwards the alt attribute to the underlying img element.
============================================================================
File: packages/figma/src/utils.ts
Line: 28 to 35
Type: potential_issue
Comment:
Component names starting with digits are invalid in React/JSX.
If frameName starts with a number (e.g., "123 Button"), the result "123Button" is not a valid component name since JavaScript identifiers and React components cannot start with a digit.
Consider prefixing with a letter when the first character is numeric:
🛡️ Proposed fix to handle numeric prefixes
 export function toComponentName(frameName: string): string {
     const words = frameName
         .replace(/[^a-zA-Z0-9 _-]/g, '')
         .split(/[\s_-]+/)
         .filter(Boolean);
     if (words.length === 0) return 'Frame';
-    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
+    const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
+    return /^[0-9]/.test(name) ? Frame${name} : name;
 }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @packages/figma/src/utils.ts around lines 28 - 35, The toComponentName function can produce names that start with a digit (from frameName) which are invalid React/JSX identifiers; update toComponentName so after building the joinedName (from words.map(...).join('')) you check if the first character is a digit (e.g., /^[0-9]/) and if so prefix it with a letter (for example 'F' or 'Frame') to guarantee the returned component name starts with a letter and remains PascalCase; keep the existing empty-name fallback ('Frame') behavior.
============================================================================
File: apps/web/client/src/components/leaderboard1.tsx
Line: 40
Type: potential_issue
Comment:
Use nullish coalescing and consider unsorted items.
Two issues with the maxValue calculation:
1. || 1 treats 0 as falsy—if the first item's value is 0, this incorrectly defaults to 1. Use ?? 1 instead.
2. This assumes items are sorted descending. If items are unsorted or a later item has a higher value, progress bars will exceed 100%.
🛠️ Proposed fix
-  const maxValue = items[0]?.value || 1;
+  const maxValue = Math.max(...items.map((item) => item.value), 1);
This computes the actual maximum across all items and ensures a minimum of 1.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/leaderboard1.tsx at line 40, maxValue currently uses items[0]?.value || 1 which treats 0 as falsy and assumes items[0] is the largest; compute the true max across all items instead and use nullish coalescing to preserve zero values. Replace the logic that sets maxValue (in the leaderboard1 component where maxValue and items are defined) with a reduction/Math.max over items' .value to get the actual maximum, then use ?? 1 as a final fallback so 0 is honored but empty lists still default to 1.
============================================================================
File: apps/web/client/src/app/login/actions.tsx
Line: 146 to 176
Type: potential_issue
Comment:
Edge case: Function returns redirect even when user is null.
If verifyOtp succeeds but data.user is unexpectedly undefined (edge case in Supabase), the function skips the DB upsert and analytics but still returns redirectTo. This could lead to a user being redirected without their record being created in the database.
Consider either:
1. Returning an error if user is missing after successful verification.
2. Or explicitly handling this as an expected edge case.
🛡️ Proposed defensive check
     const user = data.user;
-    if (user) {
+    if (!user) {
+        return { error: 'Verification succeeded but user data is missing' };
+    }
+
-        await db
+    await db
             .insert(users)
             .values({
                 id: user.id,
                 firstName: '',
                 lastName: '',
                 displayName: user.email ?? '',
                 email: user.email ?? '',
                 avatarUrl: null,
             })
             .onConflictDoUpdate({
                 target: [users.id],
                 set: {
                     email: user.email ?? '',
                     updatedAt: new Date(),
                 },
             });
-
-        trackEvent({
+
+    trackEvent({
             distinctId: user.id,
             event: 'user_signed_in',
             properties: {
                 email: user.email,
                 $set_once: { signup_date: new Date().toISOString() },
             },
         });
-    }
 
     return { redirectTo: Routes.AUTH_REDIRECT };
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/login/actions.tsx around lines 146 - 176, The code returns the redirect even when data.user is null; add a defensive check after obtaining const user = data.user to handle the edge case: if (!user) then either throw a descriptive error (e.g., throw new Error('verifyOtp succeeded but no user returned')) or return an explicit failure result instead of returning { redirectTo: Routes.AUTH_REDIRECT }; update references in this block where user is used (the db.insert(users)... onConflictDoUpdate and trackEvent calls) so they only run when user is present and ensure the function returns an appropriate error/response when user is missing.
============================================================================
File: apps/web/client/src/components/kibo-ui/code-block/server.tsx
Line: 29 to 59
Type: potential_issue
Comment:
XSS vulnerability when syntax highlighting is disabled.
When syntaxHighlighting = false, the raw children string is passed directly to dangerouslySetInnerHTML without any sanitization. While Shiki's codeToHtml properly escapes HTML entities, bypassing it exposes the component to XSS if children could ever contain untrusted content (e.g.,  tags, event handlers).
Consider escaping the content when syntax highlighting is disabled:
🛡️ Proposed fix
+ const escapeHtml = (str: string) =>
+   str
+     .replace(/&/g, "&amp;")
+     .replace(//g, "&gt;")
+     .replace(/"/g, "&quot;")
+     .replace(/'/g, "&#039;");
+
  const html = syntaxHighlighting
    ? await codeToHtml(children as string, {
        // ... shiki options
      })
-   : children;
+   : ${escapeHtml(children)};
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/kibo-ui/code-block/server.tsx around lines 29 - 59, The component currently sets dangerouslySetInnerHTML to raw children when syntaxHighlighting is false, causing an XSS risk; update the logic around html (and the branch using syntaxHighlighting, children, and codeToHtml) so that when syntaxHighlighting is false you escape or sanitize the children before assigning to html (e.g., use an escapeHtml utility or a trusted sanitizer like DOMPurify) and ensure non-string children are handled safely; keep the code path that uses codeToHtml unchanged for the true case but guarantee the html value is always safe before rendering with dangerouslySetInnerHTML.
============================================================================
File: apps/web/client/src/components/code-example1.tsx
Line: 231 to 232
Type: potential_issue
Comment:
Unsafe type assertion for BundledLanguage.
The cast item.language as BundledLanguage assumes all language strings in codeSnippets are valid BundledLanguage values. If a consumer passes a snippet with an unsupported language, this could cause runtime issues in the syntax highlighter.
Consider validating the language or documenting this constraint in the CodeSnippet interface.
shiki BundledLanguage supported languages list
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/code-example1.tsx around lines 231 - 232, The code unsafely casts item.language to BundledLanguage when rendering CodeBlockContent; validate or map item.language against the supported shiki BundledLanguage set before casting to avoid runtime errors. Update the code that prepares/iterates codeSnippets (or the CodeSnippet type) so you either: 1) narrow/validate item.language at runtime (e.g., check inclusion in a knownSupportedLanguages array and fallback to a safe default like "text"), or 2) enforce the constraint in the CodeSnippet interface/constructor so item.language is already a BundledLanguage; reference CodeBlockContent, BundledLanguage, item.language, codeSnippets and CodeSnippet when making the change.
============================================================================
File: apps/web/client/src/components/blog7.tsx
Line: 98 to 108
Type: potential_issue
Comment:
Add rel="noopener noreferrer" to external links.
Using target="_blank" without rel="noopener noreferrer" can expose the page to window.opener attacks, where the opened page could potentially redirect the original page. This applies to all three  tags in this component (lines 98, 112, 126).
🔒 Proposed fix for all external links
                 
               
-                  
+                  
                     {post.title}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/blog7.tsx around lines 98 - 108, The three external anchor elements in blog7.tsx that use target="_blank" (e.g., the  anchors surrounding the post image and other post links) should include rel="noopener noreferrer" to prevent window.opener attacks; update each anchor element in the component to add rel="noopener noreferrer" alongside the existing target attribute so all external links are opened safely.
============================================================================
File: apps/web/client/src/components/about3.tsx
Line: 152 to 156
Type: potential_issue
Comment:
Security: Add rel="noopener noreferrer" to external link.
Using target="_blank" without rel="noopener noreferrer" exposes users to tabnabbing attacks where the opened page can access window.opener.
🔒 Proposed fix
               
-                
+                
                   {breakout.buttonText}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/about3.tsx around lines 152 - 156, The external anchor inside the Button component (in about3.tsx) uses target="_blank" without rel attributes; update the  element that renders breakout.buttonUrl and breakout.buttonText to include rel="noopener noreferrer" to prevent tabnabbing and ensure safe external linking while keeping target="_blank".
============================================================================
File: apps/web/client/src/components/careers4.tsx
Line: 91 to 93
Type: potential_issue
Comment:
Add accessible label to icon link.
The arrow icon link has no accessible label, making it unclear to screen reader users what this link does. Add an aria-label to describe the action.
♿ Proposed fix to add aria-label
-                  
+
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/careers4.tsx around lines 91 - 93, The anchor wrapping the ArrowRight icon in the Careers4 component has no accessible label; update the  element that renders ArrowRight (the job link) to include an aria-label that describes the action, e.g., aria-label={View ${job.title} details} or a similar descriptive string so screen readers know where the link goes; ensure the label uses job-specific text or a clear phrase like "View job details" to provide meaningful context.
============================================================================
File: apps/web/client/src/app/login/actions.tsx
Line: 166 to 173
Type: potential_issue
Comment:
Review PII logging in analytics event.
The email property is being sent directly to analytics. This could raise GDPR/CCPA compliance concerns depending on your analytics provider's data processing agreement. Consider:
1. Removing the email from event properties if not strictly necessary.
2. Hashing or anonymizing the email if you need to track unique users.
3. Confirming your analytics provider allows PII in event properties.
🔒 Proposed fix to remove PII
         trackEvent({
             distinctId: user.id,
             event: 'user_signed_in',
             properties: {
-                email: user.email,
                 $set_once: { signup_date: new Date().toISOString() },
             },
         });
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/login/actions.tsx around lines 166 - 173, The analytics call in trackEvent is sending PII (user.email); update the user_signed_in event in actions.tsx to avoid raw emails by either removing the email property or replacing it with an anonymized identifier (e.g., hash of user.email) before sending; modify the properties object in the trackEvent call (refer to trackEvent and properties) to omit user.email or set a hashed value derived from user.email (compute hash in the calling scope, e.g., hashEmail(user.email)) and keep distinctId as needed only if it isn't PII.
============================================================================
File: apps/web/client/src/components/blogpost1.tsx
Line: 141
Type: potential_issue
Comment:
Same missing space issue before the link.
The {""} pattern doesn't add whitespace. The text will render as "...came up witha brilliant plan" without a space.
🐛 Proposed fix
           
-            The king thought long and hard, and finally came up with{""}
+            The king thought long and hard, and finally came up with{" "}
             a brilliant plan: he would tax the jokes in the
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/blogpost1.tsx at line 141, In the BlogPost1 component replace the empty JSX expression used for spacing in the text node ("The king thought long and hard, and finally came up with{""}") with an actual space so the link isn’t concatenated to the previous word; locate that string in apps/web/client/src/components/blogpost1.tsx and change the spacing to a real space (e.g., use " " or ensure there is a literal trailing space before the link) so the rendered output reads correctly.
============================================================================
File: apps/web/client/src/components/about3.tsx
Line: 36 to 39
Type: potential_issue
Comment:
Potential runtime error: achievements may be undefined.
The achievements prop is optional in the interface (line 36-39) and has a default value (lines 95-100), but if a caller explicitly passes achievements={undefined}, the default won't apply and .map() at line 197 will throw.
🛡️ Proposed fix: Add null check before mapping
-            {achievements.map((item, idx) => (
+            {achievements?.map((item, idx) => (
Alternatively, ensure the default is applied even when undefined is explicitly passed:
-  achievements = [
+  achievements: achievementsProp = [
     { label: "Companies", value: "300+" },
     ...
   ],
+// Then use:
+const achievements = achievementsProp ?? [
+  { label: "Companies", value: "300+" },
+  ...
+];
Also applies to: 95-100, 197-207
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/about3.tsx around lines 36 - 39, The optional prop achievements on the About3 component can be explicitly passed as undefined and cause a runtime error when calling .map (see usage at achievements.map around line ~197); fix by ensuring a non-undefined array is used before mapping—either apply a safe fallback when destructuring props in the About3 component (e.g., default to the declared default achievements constant) or add a null/undefined check before mapping (e.g., use (achievements || defaultAchievements).map(...)). Update the destructuring/defaulting logic that currently sets defaults (around lines ~95-100) or wrap the achievements.map call to guard against undefined.
============================================================================
File: apps/backend/supabase/config.toml
Line: 11 to 17
Type: potential_issue
Comment:
Verify environment separation and remove localhost URLs if deploying to production.
The configuration mixes localhost development URLs with production weblab.build URLs. If this config is deployed to production:
1. Security concern: Localhost URLs in additional_redirect_urls (lines 13-14) could be exploited or cause confusion, though the risk is relatively low.
2. Best practice: Consider using environment-specific configuration files or environment variable interpolation to separate development and production settings.
Are you deploying this configuration to production, or is this a shared development config?
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/backend/supabase/config.toml around lines 11 - 17, The config mixes development and production redirect URLs: remove the localhost entries from additional_redirect_urls when deploying to production, or switch to environment-specific config or env var interpolation so site_url and additional_redirect_urls are set per environment; specifically update the site_url and additional_redirect_urls block to omit "http://localhost:3000" and "http://localhost:3000/auth/callback" for production and wire these values to environment variables instead.
============================================================================
File: apps/web/client/src/components/ui/label.tsx
Line: 4
Type: potential_issue
Comment:
Verify the Radix UI import path.
The import from "radix-ui" appears incorrect. Radix UI packages are typically scoped under @radix-ui/ (e.g., @radix-ui/react-label). Please verify this import works correctly.
What is the correct import for Radix UI Label component?
🔧 Typical shadcn/ui Label import pattern
-import { Label as LabelPrimitive } from "radix-ui"
+import * as LabelPrimitive from "@radix-ui/react-label"
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/label.tsx at line 4, The import for the Radix Label is wrong; replace the current import source with the scoped Radix package so the named import { Label as LabelPrimitive } comes from "@radix-ui/react-label" (and ensure the package is installed) so all usages of LabelPrimitive in this module resolve correctly.
============================================================================
File: apps/web/client/package.json
Line: 48
Type: potential_issue
Comment:
@storybook/test version mismatch and incorrect placement.
Two issues with this dependency:
1. Version mismatch: @storybook/test: ^8.6.14 conflicts with Storybook 10.x packages in devDependencies (lines 135-140, 154). This will likely cause runtime errors or unexpected behavior.
2. Wrong section: Testing utilities should be in devDependencies, not dependencies.
Proposed fix
Move to devDependencies and update to match other Storybook packages:
  "dependencies": {
    ...
-   "@storybook/test": "^8.6.14",
    ...
  },
  "devDependencies": {
+   "@storybook/test": "^10.0.4",
    ...
  }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/package.json at line 48, The package "@storybook/test" is declared in dependencies with version "^8.6.14" which conflicts with the project's Storybook 10.x packages and is in the wrong section; move the "@storybook/test" entry from the "dependencies" object into "devDependencies" and update its version to the same major/minor series used by the other Storybook packages (match the 10.x versions present in devDependencies) so all Storybook packages are aligned.



============================================================================
File: apps/web/client/src/app/projects/import/figma/page.tsx
Line: 14 to 18
Type: potential_issue
Comment:
Missing custom prop for dynamic variants.
The variants object uses dynamic functions that expect a direction parameter, but the motion.div on line 46 doesn't pass a custom prop. Without it, direction will be undefined, and 120 * undefined results in NaN, breaking the slide animation.
You need to track the navigation direction (forward/backward) and pass it to the motion component.
🐛 Proposed fix
Track direction in state or context, then pass it:
 const Page = () => {
-    const { currentStep } = useFigmaImport();
+    const { currentStep, direction } = useFigmaImport(); // or track direction locally
     const { ref } = useResizeObserver();
     const backgroundUrl = useGetBackground('create');
                                     
Alternatively, if direction tracking isn't available, use a static value (e.g., custom={1}) for consistent forward animation.
Also applies to: 46-52
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/projects/import/figma/page.tsx around lines 14 - 18, The variants object (variants.initial and variants.exit) expects a numeric direction but the motion.div rendering the Figma page does not pass a custom prop, so direction becomes undefined and the animation calculates NaN; fix by tracking navigation direction (e.g., a state like direction or signedPageDelta updated when changing pages) and pass it into the motion component as custom={direction} (or if you can't compute direction reliably, pass a static value like custom={1} for a consistent forward animation), updating the code that calls motion.div (the component rendering the Figma page) to supply that custom prop so variants receive the numeric parameter.
============================================================================
File: apps/web/client/src/components/blog7.tsx
Line: 23 to 31
Type: potential_issue
Comment:
Unused props and type mismatch with defaults.
1. buttonText and buttonUrl are declared in the interface but never used in the component JSX.
2. Post.label (line 16) is also never rendered.
3. Props like tagline, heading, description, and posts are marked as required in the interface, but the component assigns default values, making them effectively optional. The types should reflect this.
🔧 Proposed fix to align types with implementation
 interface Blog7Props {
-  tagline: string;
-  heading: string;
-  description: string;
-  buttonText: string;
-  buttonUrl: string;
-  posts: Post[];
+  tagline?: string;
+  heading?: string;
+  description?: string;
+  posts?: Post[];
   className?: string;
 }
Either remove buttonText/buttonUrl if unused, or implement the intended button functionality.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/blog7.tsx around lines 23 - 31, The Blog7 component has unused props and a type mismatch: Blog7Props declares required tagline, heading, description, posts, plus buttonText/buttonUrl which aren’t used, and Post.label is never rendered; update Blog7Props to mark tagline, heading, description, and posts as optional (use ?) to reflect the component's default values, and either remove buttonText and buttonUrl from Blog7Props (and any related unused variables) or implement the button rendering inside the Blog7 component to use buttonText/buttonUrl; also remove or render Post.label where posts are mapped (reference Post.label and the Blog7 component) so the interface and JSX stay consistent.
============================================================================
File: apps/web/client/src/components/ui/badge.tsx
Line: 15 to 16
Type: potential_issue
Comment:
Fix duplicate dark:dark: prefix and conflicting dark mode classes in destructive variant.
Issues in the destructive variant:
1. dark:dark:bg-red-900/60 and dark:dark:focus-visible:ring-red-900/40 have duplicate dark: prefixes.
2. dark:bg-red-500/60 is overridden by dark:bg-red-900 later in the same string—remove the dead code.
🐛 Proposed fix
         destructive:
-          "bg-red-500 text-white focus-visible:ring-red-500/20 dark:bg-red-500/60 dark:focus-visible:ring-red-500/40 [a&]:hover:bg-red-500/90 dark:bg-red-900 dark:focus-visible:ring-red-900/20 dark:dark:bg-red-900/60 dark:dark:focus-visible:ring-red-900/40 dark:[a&]:hover:bg-red-900/90",
+          "bg-red-500 text-white focus-visible:ring-red-500/20 [a&]:hover:bg-red-500/90 dark:bg-red-900 dark:focus-visible:ring-red-900/20 dark:bg-red-900/60 dark:focus-visible:ring-red-900/40 dark:[a&]:hover:bg-red-900/90",
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/badge.tsx around lines 15 - 16, In the destructive variant string in badge.tsx remove the duplicated dark:dark: prefixes and eliminate the dead/conflicting dark:bg-red-500/60 so only the intended dark-mode classes remain (e.g., keep dark:bg-red-900 and dark:focus-visible:ring-red-900/20 and the hover dark:[a&]:hover:bg-red-900/90); update the destructive variant value so there are no duplicate dark: prefixes and no overridden dark classes.
============================================================================
File: apps/web/client/src/components/ui/carousel.tsx
Line: 96 to 105
Type: potential_issue
Comment:
Missing cleanup for reInit event listener.
The cleanup function removes only the select listener but not the reInit listener, which can cause a memory leak if the component unmounts or api changes.
🔧 Proposed fix
   React.useEffect(() => {
     if (!api) return
     onSelect(api)
     api.on("reInit", onSelect)
     api.on("select", onSelect)
     return () => {
+      api?.off("reInit", onSelect)
       api?.off("select", onSelect)
     }
   }, [api, onSelect])
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/carousel.tsx around lines 96 - 105, The useEffect registers two event listeners on api ("reInit" and "select") but the cleanup only removes "select", risking leaks; update the cleanup in the effect that references api and onSelect to remove both listeners (call api.off("reInit", onSelect) and api.off("select", onSelect)) and ensure you still guard with api? when unsubscribing so it handles api changes or component unmounts.
============================================================================
File: apps/web/client/src/components/blogpost1.tsx
Line: 55
Type: potential_issue
Comment:
Missing space before "Owner of".
{""} is an empty string and adds no whitespace. This will render as "Owner of" directly concatenated with the preceding content. Use {" "} to add a space.
🐛 Proposed fix
             
-              Owner of{""}
+              Owner of{" "}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/blogpost1.tsx at line 55, In the BlogPost1 component replace the pointless empty string concatenation {""} after the text "Owner of" with an actual space (use {" "} or include the trailing space in the surrounding string) so the rendered output correctly separates the preceding content and "Owner of"; locate the JSX fragment containing the "Owner of" text and update it to use {" "} instead of {""}.
============================================================================
File: apps/web/client/src/components/about3.tsx
Line: 143 to 147
Type: potential_issue
Comment:
Handle optional breakout.src and breakout.alt.
The interface declares src and alt as optional within breakout, but they're used directly. If not provided and no default applies, the  will have src={undefined}.
🛡️ Proposed fix: Conditionally render the image
-              
+              {breakout.src && (
+                
+              )}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/about3.tsx around lines 143 - 147, The  uses breakout.src and breakout.alt which are optional; update the component (where the JSX renders breakout, e.g., in About3 or the function that contains the ) to only render the  when breakout?.src is present (and provide a safe fallback for alt such as breakout?.alt ?? ''), so you never pass undefined to src/alt; ensure conditional rendering covers the entire  element rather than just setting attributes.
============================================================================
File: apps/web/client/src/components/compliance1.tsx
Line: 28
Type: potential_issue
Comment:
Minor text quality issue in default description.
The phrase "GDPR HIPAA requirements" is missing punctuation or a conjunction. Consider "GDPR and HIPAA requirements" or "GDPR, HIPAA requirements" for better readability.
✏️ Suggested fix
-  description = "Stay compliant with privacy and healthcare regulations. Our platform meets GDPR HIPAA requirements, providing data protection compliance monitoring for regulated industries.",
+  description = "Stay compliant with privacy and healthcare regulations. Our platform meets GDPR and HIPAA requirements, providing data protection and compliance monitoring for regulated industries.",
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/compliance1.tsx at line 28, The default description string assigned to description in the compliance1 component is missing a conjunction between "GDPR" and "HIPAA"; update the description value (the description variable/prop in compliance1.tsx) to use proper punctuation or a conjunction, e.g., "Stay compliant with privacy and healthcare regulations. Our platform meets GDPR and HIPAA requirements, providing data protection compliance monitoring for regulated industries." to improve readability.
============================================================================
File: apps/web/client/src/components/compliance1.tsx
Line: 97 to 101
Type: potential_issue
Comment:
Edge case in border logic with 2 or fewer features.
The current border logic creates visual issues:
- With 2 features: both border-b (first) and border-t (second) apply, creating a double border line.
- With 1 feature: both conditions are true, applying both top and bottom borders unnecessarily.
The default of 3 features works correctly, but consumers could pass different lengths.
♻️ Suggested fix using a cleaner separator approach
               className={cn(
                 "relative overflow-hidden p-6 lg:px-8 lg:py-11",
-                index === 0 && "border-b border-slate-200 dark:border-slate-800",
-                index === features.length - 1 && "border-t border-slate-200 dark:border-slate-800",
+                index
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/compliance1.tsx around lines 97 - 101, The border logic on the feature item class is causing double borders for arrays of length 1 or 2; update the condition in the className construction (where cn is used, around the JSX that references index and features) to apply only a bottom separator for all items except the last (e.g., use index !== features.length - 1 for "border-b ...") and remove the special-case top border check (the index === features.length - 1 "border-t ..." branch) so items render a single consistent separator regardless of features.length.
============================================================================
File: apps/web/client/src/app/login/page.tsx
Line: 29 to 43
Type: potential_issue
Comment:
Missing try/catch for async operation can leave UI in stuck loading state.
If sendEmailOtp throws an exception (network failure, unexpected error), setIsEmailLoading(false) on line 35 will never execute, leaving the button permanently disabled with a spinner.
🛡️ Proposed fix using try/finally
     async function handleSendCode(e: React.FormEvent) {
         e.preventDefault();
         if (!email) return;
         setIsEmailLoading(true);
         setEmailError(null);
-        const result = await sendEmailOtp(email);
-        setIsEmailLoading(false);
-        if (result.error) {
-            setEmailError(result.error);
-            return;
+        try {
+            const result = await sendEmailOtp(email);
+            if (result.error) {
+                setEmailError(result.error);
+                return;
+            }
+            const params = new URLSearchParams({ email });
+            if (returnUrl) params.set(LocalForageKeys.RETURN_URL, returnUrl);
+            router.push(${Routes.LOGIN_VERIFY}?${params.toString()});
+        } catch (err) {
+            setEmailError('An unexpected error occurred. Please try again.');
+        } finally {
+            setIsEmailLoading(false);
         }
-        const params = new URLSearchParams({ email });
-        if (returnUrl) params.set(LocalForageKeys.RETURN_URL, returnUrl);
-        router.push(${Routes.LOGIN_VERIFY}?${params.toString()});
     }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/login/page.tsx around lines 29 - 43, The handleSendCode function can leave the UI stuck loading if sendEmailOtp throws; wrap the await sendEmailOtp(email) call in a try/finally (or try/catch/finally) so setIsEmailLoading(false) always runs, and in the catch setEmailError with a friendly message or the error; specifically update handleSendCode to setIsEmailLoading(true) before the try, await sendEmailOtp(email) inside the try, handle result.error as now, and perform setIsEmailLoading(false) in finally to guarantee the spinner/button state is cleared even on exceptions.
============================================================================
File: apps/web/client/src/components/cta35.tsx
Line: 5 to 9
Type: potential_issue
Comment:
Naming conflict: Local Button interface shadows the imported Button component.
The interface name Button on line 5 shadows the imported Button component from @/components/ui/button on line 1. This can cause confusion and potential issues if someone tries to reference the component type elsewhere in the file.
♻️ Proposed fix: Rename the interface
-interface Button {
+interface ButtonConfig {
   text: string;
   url: string;
   icon?: React.ReactNode;
 }
 interface Buttons {
-  primary?: Button;
-  secondary?: Button;
+  primary?: ButtonConfig;
+  secondary?: ButtonConfig;
 }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/cta35.tsx around lines 5 - 9, Rename the local interface named Button (which currently conflicts with the imported Button component from '@/components/ui/button') to a non-conflicting name such as LinkButtonProps or CTAButton; update every reference to this interface in this file (e.g., prop annotations, variable typings) to the new name and keep the imported Button component name unchanged so the component and the interface are no longer shadowing each other.
============================================================================
File: apps/web/client/src/components/product-quick-view4.tsx
Line: 100 to 117
Type: potential_issue
Comment:
Empty alt attributes reduce accessibility.
All product images have alt: "". While decorative images can have empty alt text, product images should describe the product for screen reader users. Consider adding meaningful descriptions like "Stylish Light Brown Hat - Front View".
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/product-quick-view4.tsx around lines 100 - 117, In the product-quick-view4 component the images array contains entries with empty alt attributes which harms accessibility; update each image object in the images array (inside product-quick-view4.tsx / images) to provide meaningful, concise alt text describing the product and view (e.g., "Stylish Light Brown Hat - Front View") so screen readers can convey the product content; keep decorative images empty only if truly non-informative, otherwise replace alt: "" with descriptive strings for each src.
============================================================================
File: apps/web/client/src/components/cta35.tsx
Line: 42 to 45
Type: potential_issue
Comment:
Shallow merge does not preserve nested buttons defaults.
The spread operator performs a shallow merge. If a consumer passes { buttons: { primary: {...} } }, the secondary button from defaultProps will be lost entirely, rather than being merged.
If the intent is to allow partial button overrides, consider deep merging the buttons object:
♻️ Proposed fix for deep merge
 const Cta35 = (props: Props) => {
-  const { heading, description, buttons, className } = {
-    ...defaultProps,
-    ...props,
-  };
+  const merged = {
+    ...defaultProps,
+    ...props,
+    buttons: {
+      ...defaultProps.buttons,
+      ...props.buttons,
+    },
+  };
+  const { heading, description, buttons, className } = merged;
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/cta35.tsx around lines 42 - 45, The current shallow merge using "{ ...defaultProps, ...props }" loses nested default entries (e.g., defaultProps.buttons.secondary) when consumers pass partial "buttons"; change the merge to preserve nested defaults by deep-merging "buttons" specifically: first compute "const buttons = { ...defaultProps.buttons, ...props.buttons }" (or use a deep merge utility like lodash.merge for deeper nesting), then merge top-level props using "{ ...defaultProps, ...props, buttons }" and use that result for "heading, description, className" extraction; update references to "buttons" accordingly in the component.
============================================================================
File: apps/web/client/src/components/product-quick-view4.tsx
Line: 323 to 325
Type: potential_issue
Comment:
Remove console.log debug statement.
The submit handler only logs to console. Replace with actual cart functionality or add a TODO comment indicating this is intentional placeholder behavior.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/product-quick-view4.tsx around lines 323 - 325, The onSubmit handler currently only logs the form values; remove the console.log from function onSubmit(values: FormType) and either implement the real cart behavior (e.g., call the existing addToCart/addItemToCart API or dispatch the cart action with the submitted values) or replace the console.log with a clear TODO comment indicating this is a deliberate placeholder for future cart logic; ensure you reference and use the FormType payload when wiring the real cart call.
============================================================================
File: apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/insert-tab/index.tsx
Line: 91 to 95
Type: potential_issue
Comment:
Missing .filter(Boolean) before .join() may cause false matches.
Unlike filteredPresets (line 66), this filter joins fields without removing falsy values first. If any field is undefined or null, it becomes the string "undefined" or "null", potentially causing false search matches.
🔧 Proposed fix
         return BLOCK_CATALOG.filter((block) =>
-            [block.label, block.description, block.registryName, block.componentName]
+            [block.label, block.description, block.registryName, block.componentName]
+                .filter(Boolean)
                 .join(' ')
                 .toLowerCase()
                 .includes(query),
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/insert-tab/index.tsx around lines 91 - 95, The filter on BLOCK_CATALOG in insert-tab's search builds a joined string from [block.label, block.description, block.registryName, block.componentName] without removing falsy values, which can turn undefined/null into "undefined"/"null" and yield false matches; update the predicate used in the return of the BLOCK_CATALOG.filter (the array mapped from block fields) to .filter(Boolean) before .join(' ') so only truthy fields are concatenated, then .toLowerCase().includes(query) as before to perform the search.
============================================================================
File: apps/web/client/src/components/compliance1.tsx
Line: 88
Type: potential_issue
Comment:
h-22 is not a standard Tailwind CSS class.
Tailwind's default height scale does not include h-22. The nearest standard classes are h-20 (5rem/80px) or h-24 (6rem/96px). This class will have no effect unless it's defined in your Tailwind config as a custom value.
✏️ Suggested fix (use standard class)
-                  className="h-22 opacity-50 grayscale md:h-28 dark:invert"
+                  className="h-20 opacity-50 grayscale md:h-28 dark:invert"
Or if you need exactly 5.5rem (88px), add a custom value to your Tailwind config.
Tailwind CSS h-22 height class
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/compliance1.tsx at line 88, The className on the image/element uses a non-standard Tailwind class "h-22" which has no effect; update the className (in the component where className="h-22 opacity-50 grayscale md:h-28 dark:invert", likely in the Compliance1 component) to use a standard height such as "h-20" or "h-24" or, if you need exactly 5.5rem (88px), add a custom height value to your Tailwind config and replace "h-22" with that custom utility name so the height is applied correctly.
============================================================================
File: apps/web/client/src/components/blogpost1.tsx
Line: 33
Type: potential_issue
Comment:
Avoid new Date() as a default parameter value.
Using new Date() as a default creates a new Date object on every render when pubDate is not provided. This can cause:
1. Hydration mismatches in SSR (server time ≠ client time)
2. Subtle bugs if child components rely on referential equality
🛠️ Proposed fix
Consider handling the default inside the component or using a stable fallback:
-  pubDate = new Date(),
+  pubDate,
   description = "A step-by-step guide to building a modern, responsive blog using React and Tailwind CSS.",
 }: Blogpost1Props) => {
+  const displayDate = pubDate ?? new Date();
   return (
Then use displayDate in the format call on line 64.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/blogpost1.tsx at line 33, The prop default pubDate = new Date() causes a new Date on each render and risks SSR hydration mismatches; remove the default parameter and instead compute a stable fallback inside the BlogPost component (e.g., create a local const like displayDate = pubDate ?? new Date()) and use that displayDate wherever formatDate or the formatting call (previously using pubDate) is invoked; update the function signature to accept pubDate?: Date and replace uses of pubDate with displayDate to ensure a single stable Date is created per render and avoid referential-equality issues.
============================================================================
File: packages/figma/package.json
Line: 8 to 10
Type: potential_issue
Comment:
Exports field conflicts with build script.
The exports field points to source TypeScript (./src/index.ts), but the build script compiles with tsc and the clean script references a dist directory. This creates an inconsistency:
- If the package is meant to be built, exports should point to the compiled output (e.g., "./dist/index.js")
- If the package exports source for monorepo consumption, the build script may be unnecessary
Verify whether this package should export compiled output or source files.
📦 Proposed fix if exporting compiled output
     "exports": {
-        ".": "./src/index.ts"
+        ".": {
+            "types": "./dist/index.d.ts",
+            "default": "./dist/index.js"
+        }
     },
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @packages/figma/package.json around lines 8 - 10, The package.json "exports" field currently points to the TypeScript source ("./src/index.ts") which conflicts with the build pipeline that uses the "build" script (tsc) and the "clean" script referencing "dist"; update the package to consistently export the compiled output by changing the exports target to the built entry (e.g., "./dist/index.js") and ensure the "main"/"types" fields (if present) and any consumers reference "dist", or alternatively remove/adjust the "build" and "clean" scripts if you intend to publish source-only—look for the "exports" key, the "build" script, the "clean" script, and "./src/index.ts" in package.json to make the consistent change.
============================================================================
File: apps/web/client/src/components/ui/badge.tsx
Line: 7 to 8
Type: potential_issue
Comment:
Fix duplicate dark:dark: prefix and conflicting border classes.
Two issues in the base classes:
1. dark:dark:aria-invalid:ring-red-900/40 has a duplicate dark: prefix—this is invalid Tailwind syntax.
2. Both border-slate-200 and border-transparent are specified, but border-transparent will override border-slate-200. Remove the redundant one.
🐛 Proposed fix
 const badgeVariants = cva(
-  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-slate-200 border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-slate-950 focus-visible:ring-[3px] focus-visible:ring-slate-950/50 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 dark:aria-invalid:ring-red-500/40 [&>svg]:pointer-events-none [&>svg]:size-3 dark:border-slate-800 dark:focus-visible:border-slate-300 dark:focus-visible:ring-slate-300/50 dark:aria-invalid:border-red-900 dark:aria-invalid:ring-red-900/20 dark:dark:aria-invalid:ring-red-900/40",
+  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-slate-950 focus-visible:ring-[3px] focus-visible:ring-slate-950/50 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 dark:aria-invalid:ring-red-500/40 [&>svg]:pointer-events-none [&>svg]:size-3 dark:border-slate-800 dark:focus-visible:border-slate-300 dark:focus-visible:ring-slate-300/50 dark:aria-invalid:border-red-900 dark:aria-invalid:ring-red-900/20 dark:aria-invalid:ring-red-900/40",
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/badge.tsx around lines 7 - 8, The badgeVariants cva base class string contains a duplicated Tailwind prefix and conflicting border utilities: remove the duplicate "dark:" so "dark:dark:aria-invalid:ring-red-900/40" becomes "dark:aria-invalid:ring-red-900/40", and eliminate the redundant border class by removing either "border-slate-200" or "border-transparent" (keep the intended default border style); update the base classes in the badgeVariants declaration to use the corrected Tailwind tokens.
============================================================================
File: apps/web/client/src/components/ui/progress.tsx
Line: 4
Type: potential_issue
Comment:
Verify Radix UI import path and syntax.
The import pattern import { Progress as ProgressPrimitive } from "radix-ui" may be incorrect. The consolidated radix-ui package uses a different structure — typically you would access it as import { Progress } from "radix-ui" and then use Progress.Root and Progress.Indicator, or continue using the individual package @radix-ui/react-progress with namespace imports.
If using the traditional package:
🔧 Suggested fix for traditional @radix-ui/react-progress
-import { Progress as ProgressPrimitive } from "radix-ui"
+import * as ProgressPrimitive from "@radix-ui/react-progress"
radix-ui package import syntax 2025
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/progress.tsx at line 4, The import line using import { Progress as ProgressPrimitive } from "radix-ui" is likely wrong; update the import to the proper Radix Progress package and export shape used in this file (e.g., import the namespace from "@radix-ui/react-progress" or import { Progress } from "@radix-ui/react-progress" and then reference Progress.Root and Progress.Indicator). Locate the symbol ProgressPrimitive in this file and replace its incorrect import with the correct package import and/or rename so that the component uses the real Radix API (Progress.Root / Progress.Indicator) or the namespace-style import (e.g., ProgressPrimitive.Root) consistently.
============================================================================
File: apps/web/client/src/components/ui/settings-modal/github-tab.tsx
Line: 192 to 193
Type: potential_issue
Comment:
Truncation won't work on inline span.
The truncate class (which sets overflow: hidden; text-overflow: ellipsis; white-space: nowrap) requires the element to be block-level or have a constrained width. An inline  won't truncate as expected.
💡 Proposed fix: Make the span block-level
 
-    {repo.full_name}
+    {repo.full_name}
     {repo.private && (
Alternatively, use a  or add className="inline-block max-w-full".
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/settings-modal/github-tab.tsx around lines 192 - 193, The inline  with className "truncate" won't apply text-overflow; update the element rendering repo.full_name (the span inside the div with className "min-w-0 flex-1") to be a block-level element or given block-like sizing so truncation works — e.g., change the span to a block element (p/div) or add "inline-block max-w-full" to its className so "truncate" can take effect and the repo.full_name will ellipsize correctly.
============================================================================
File: apps/web/client/src/components/ui/alert.tsx
Line: 50 to 64
Type: refactor_suggestion
Comment:
Consider adding ref forwarding for consistency.
Similar to the other components, AlertDescription should use React.forwardRef for consistency with shadcn/ui patterns and better composability.
🔄 Proposed refactor to add ref forwarding
-function AlertDescription({
+const AlertDescription = React.forwardRef
+>(({
   className,
   ...props
-}: React.ComponentProps) {
+}, ref) => {
   return (
     
   )
-}
+})
+AlertDescription.displayName = "AlertDescription"
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/alert.tsx around lines 50 - 64, The AlertDescription component should support ref forwarding: convert the function AlertDescription into a React.forwardRef component that accepts (props, ref) (use React.ComponentPropsWithRef for typing), pass the ref to the returned  (ref={ref}), and preserve existing props, className merging via cn, data-slot, and spread {...props}; update the function name export/identifier as needed so other components can import the forwarded ref version.
============================================================================
File: apps/web/client/src/components/cta34.tsx
Line: 42 to 45
Type: potential_issue
Comment:
Shallow merge won't preserve default nested buttons properties.
The spread merge {...defaultProps, ...props} replaces nested objects entirely. If a caller passes buttons: { primary: {...} }, the default secondary button will be lost.
If this is intentional, consider documenting the behavior. Otherwise, deep merge the buttons object.
🔧 Proposed fix for deep merging buttons
 const Cta34 = (props: Props) => {
-  const { heading, description, buttons, className } = {
-    ...defaultProps,
-    ...props,
-  };
+  const merged = {
+    ...defaultProps,
+    ...props,
+    buttons: {
+      ...defaultProps.buttons,
+      ...props.buttons,
+    },
+  };
+  const { heading, description, buttons, className } = merged;
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/cta34.tsx around lines 42 - 45, The current shallow merge in the CTA component replaces nested objects (so defaultProps.buttons gets overwritten when props.buttons is provided); update the merge in cta34 so that buttons are merged deeply by explicitly merging defaultProps.buttons with props.buttons (e.g., produce a mergedButtons = { ...defaultProps.buttons, ...props.buttons } and then use that mergedButtons when extracting heading, description, className and buttons), ensuring default nested keys like secondary are preserved while allowing callers to override individual button fields.
============================================================================
File: apps/web/client/src/components/ui/settings-modal/github-tab.tsx
Line: 203 to 210
Type: potential_issue
Comment:
Import buttons don't pass repository context.
Each repository's "Import" button navigates to Routes.IMPORT_GITHUB without passing the selected repository's information (e.g., repo.id, repo.full_name). This creates a confusing UX where clicking "Import" on a specific repo behaves identically to the generic "Import a repository" button below.
Consider either:
1. Passing the repo info via query params or route state
2. Removing per-repo Import buttons if manual selection is intended on the import page
💡 Proposed fix: Pass repo info via query params
  router.push(Routes.IMPORT_GITHUB)}
+    onClick={() => router.push(${Routes.IMPORT_GITHUB}?repo=${encodeURIComponent(repo.full_name)})}
 >
     Import
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/settings-modal/github-tab.tsx around lines 203 - 210, The per-repo "Import" Button currently calls router.push(Routes.IMPORT_GITHUB) without context, so clicking any repo behaves like the generic import; update the onClick handler for the Button in github-tab.tsx to include the selected repository info (e.g., repo.id and repo.full_name) when navigating—either append as query params (router.push(${Routes.IMPORT_GITHUB}?repoId=${repo.id}&fullName=${encodeURIComponent(repo.full_name)}) or pass via route state (router.push(Routes.IMPORT_GITHUB, { state: { repoId: repo.id, fullName: repo.full_name } })), and ensure the import page reads those params/state; alternatively remove the per-repo Button if you intend selection only on the import page.
============================================================================
File: apps/web/client/src/components/ui/alert.tsx
Line: 22 to 35
Type: refactor_suggestion
Comment:
Consider adding ref forwarding for better composability.
shadcn/ui components typically use React.forwardRef to allow parent components to access the underlying DOM element. This enables use cases like focus management, scroll behavior, and integration with animation libraries.
🔄 Proposed refactor to add ref forwarding
-function Alert({
+const Alert = React.forwardRef & VariantProps
+>(({
   className,
   variant,
   ...props
-}: React.ComponentProps & VariantProps) {
+}, ref) => {
   return (
     
   )
-}
+})
+Alert.displayName = "Alert"
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/alert.tsx around lines 22 - 35, The Alert component should forward refs so parent components can access the underlying div; wrap the existing Alert function with React.forwardRef, accept a ref parameter (HTMLDivElement) alongside the existing props type (React.ComponentProps & VariantProps), and pass that ref to the rendered  (currently using data-slot="alert" and role="alert") while keeping className computed via cn(alertVariants({ variant }), className) and spreading {...props}; ensure the exported symbol remains Alert (or adjust export to the forwarded component) so usages keep working.
============================================================================
File: apps/web/client/src/server/api/routers/components.ts
Line: 30
Type: potential_issue
Comment:
Comment stripping may incorrectly remove content inside strings.
The regex-based comment removal doesn't distinguish between actual comments and comment-like sequences inside string literals or template literals:
const msg = "See // documentation";  // '// documentation' preserved incorrectly
const url = https://example.com;   // works fine
const code = "/ not a comment /";  // gets stripped
This could cause false negatives if an export keyword appears after such content. For component discovery purposes, the impact is likely minimal since export statements typically appear at the start of lines.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/server/api/routers/components.ts at line 30, The current single-line regex that builds stripped from source (the two chained .replace calls) can remove comment-like text inside string/template literals; replace this approach by parsing the module with a proper JS/TS parser (e.g., @babel/parser or TypeScript compiler API) and either (a) programmatically walk the AST to find export declarations (ExportNamedDeclaration, ExportDefaultDeclaration, ExportAllDeclaration) instead of doing string comment-stripping, or (b) reprint the AST without comments using a generator so you reliably remove real comments only; update the code that references stripped to use the parsed/AST-derived result and ensure parser options include JSX/TypeScript as needed.
============================================================================
File: apps/web/client/src/components/ui/alert.tsx
Line: 37 to 48
Type: refactor_suggestion
Comment:
Consider adding ref forwarding for consistency.
Similar to the Alert component, AlertTitle should use React.forwardRef for consistency with shadcn/ui patterns and better composability.
🔄 Proposed refactor to add ref forwarding
-function AlertTitle({ className, ...props }: React.ComponentProps) {
+const AlertTitle = React.forwardRef
+>(({ className, ...props }, ref) => {
   return (
     
   )
-}
+})
+AlertTitle.displayName = "AlertTitle"
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/alert.tsx around lines 37 - 48, AlertTitle currently is a plain function component; change it to use React.forwardRef so it accepts a ref like the Alert component and follows shadcn/ui patterns: update AlertTitle to a React.forwardRef> wrapper, add the ref parameter and pass it to the root div (data-slot="alert-title"), retain the existing props and className merging, and set AlertTitle.displayName for readability.
============================================================================
File: apps/web/client/src/components/code-example1.tsx
Line: 188 to 199
Type: potential_issue
Comment:
Use controlled value prop on Tabs for consistency.
The component maintains selectedLanguage state and passes onValueChange={setSelectedLanguage}, but uses defaultValue on the Tabs. This creates a mixed controlled/uncontrolled pattern. For full control and to ensure the Tabs selection stays in sync with component state, use the value prop:
🔧 Proposed fix
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/code-example1.tsx around lines 188 - 199, The Tabs component is using defaultValue while the component maintains controlled state via selectedLanguage and setSelectedLanguage, creating a mixed controlled/uncontrolled pattern; change Tabs to use the controlled value prop (value) bound to selectedLanguage (with an optional fallback to codeSnippets[0]?.language if you need an initial value) and keep onValueChange={setSelectedLanguage} so selection stays fully in sync; update the Tabs instantiation that currently uses defaultValue={codeSnippets[0]?.language} to use value={selectedLanguage / or selectedLanguage || codeSnippets[0]?.language / } and leave TabsList/TabsTrigger as-is.
============================================================================
File: apps/web/client/src/components/logos18.tsx
Line: 111 to 124
Type: potential_issue
Comment:
href property is defined but never used.
The LogosSimpleStaticLogo type includes href and all default logos have href values, but logos are rendered as plain  elements without wrapping them in anchor tags. This appears to be incomplete functionality.
🔗 Proposed fix to make logos clickable
             {visibleLogos.map((logo, index) => (
-              
                 
-              
+              
             ))}
If href is optional and some logos shouldn't be links, conditionally wrap:
{visibleLogos.map((logo, index) => {
  const Wrapper = logo.href ? 'a' : 'div';
  const wrapperProps = logo.href 
    ? { href: logo.href, target: "_blank", rel: "noopener noreferrer" } 
    : {};
  return (
    
      
    
  );
})}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/logos18.tsx around lines 111 - 124, The logos' href values from the LogosSimpleStaticLogo type are unused because images are rendered as plain ; update the visibleLogos rendering in the map inside the Logos component to conditionally wrap the  with an  when logo.href exists (preserve the key and the wrapper className "flex aspect-3/1 w-28 items-center justify-center sm:w-32"), and when wrapping use safe link attributes (target="_blank" rel="noopener noreferrer"); ensure the logo.href is treated as optional in the component if needed and keep the img's className logic (cn(...)) intact.
============================================================================
File: apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx
Line: 212 to 217
Type: potential_issue
Comment:
Missing state cleanup on error path leaves UI in stuck state.
When insertion fails, pendingInsertComponent and pendingInsertBlock are not cleared. The user remains stuck with a crosshair cursor and each click will retry the same failing insertion. The state should be cleared in the catch blocks to allow recovery.
🐛 Proposed fix to clear state on error
                 } catch (error) {
                     console.error('Failed to insert component from panel:', error);
                     toast.error('Failed to insert component', {
                         description: error instanceof Error ? error.message : 'Unknown error',
                     });
+                    editorEngine.state.setPendingInsertComponent(null);
                 }
                 return;
             }
                 } catch (error) {
                     console.error('Failed to insert block from palette:', error);
                     toast.error('Failed to insert block', {
                         description: error instanceof Error ? error.message : 'Unknown error',
                     });
+                    editorEngine.state.setPendingInsertBlock(null);
                 }
                 return;
             }
Also consider the same fix for pendingInsertElement at lines 270-275:
                 } catch (error) {
                     console.error('Failed to insert element from palette:', error);
                     toast.error('Failed to insert element', {
                         description: error instanceof Error ? error.message : 'Unknown error',
                     });
+                    editorEngine.state.setPendingInsertElement(null);
                 }
Also applies to: 241-246
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx around lines 212 - 217, The catch blocks that log insertion failures (around the insert-from-panel handlers) fail to reset insertion state, leaving pendingInsertComponent and pendingInsertBlock (and similarly pendingInsertElement in the other handler) set and the cursor stuck; update the catch handlers in the functions that reference pendingInsertComponent/pendingInsertBlock (and the one that uses pendingInsertElement) to clear those state variables (set them back to null/undefined or call the existing state-reset helper) before logging/toasting the error so the UI can recover and further clicks won't retry the failed insertion.
============================================================================
File: apps/web/client/src/components/product-quick-view4.tsx
Line: 434 to 436
Type: potential_issue
Comment:
Return null instead of implicit undefined.
Same pattern - return null explicitly for consistency.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/product-quick-view4.tsx around lines 434 - 436, The SizeRadioGroup component currently returns nothing when options is falsy; update the early exit in SizeRadioGroup (component function handling props typed as RadioGroupProps with parameter names options and field) to explicitly return null instead of implicit undefined to maintain React/TSX consistency and clear intent.
============================================================================
File: apps/web/client/src/app/projects/import/figma/_context/index.tsx
Line: 115 to 126
Type: potential_issue
Comment:
Potential duplicate file paths if frames have similar names.
If two Figma frames have names that result in the same component name after toComponentName conversion (e.g., "My Frame" and "my-frame" both becoming "MyFrame"), the generated file paths will collide, and the later file will overwrite the earlier one.
Consider deduplicating or appending a suffix to handle name collisions.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/projects/import/figma/_context/index.tsx around lines 115 - 126, The generated file paths for frames can collide because toComponentName(frame.name) may produce duplicate names; modify the files creation logic that builds the ProcessedFile[] (where selectedFrames are mapped to paths using toComponentName, scaffoldFrameComponent, and ProcessedFileType.TEXT) to detect duplicate component names and disambiguate them (e.g., keep a Set or map of used names and append a numeric suffix or index to the component name/path when a collision is detected) before constructing each path; ensure scaffoldAppPage still receives the original selectedFrames order if it relies on names or update it to use the deduped names.
============================================================================
File: apps/web/client/src/components/product-quick-view4.tsx
Line: 280 to 282
Type: potential_issue
Comment:
Return null instead of implicit undefined from React components.
if (!images) return; returns undefined. React components should explicitly return null when rendering nothing.
🔧 Proposed fix
 const ProductImages = ({ images }: ProductImagesProps) => {
-  if (!images) return;
+  if (!images) return null;
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/product-quick-view4.tsx around lines 280 - 282, The ProductImages component currently does an implicit undefined return when images is falsy by using "if (!images) return;", update it to explicitly return null (e.g., "if (!images) return null;") so React renders nothing correctly; also update the ProductImages function signature if needed to reflect a possible null return type (for example returning React.ReactElement | null) to satisfy TypeScript and linter checks.
============================================================================
File: packages/figma/src/types.ts
Line: 44 to 50
Type: potential_issue
Comment:
Type inconsistency: backgroundColor uses different types across interfaces.
FigmaTopLevelFrame.backgroundColor is defined as string (CSS hex), while FigmaNode.backgroundColor uses FigmaColor. This inconsistency can lead to type confusion and makes it difficult to work with backgroundColor across different contexts.
Consider either:
1. Using FigmaColor consistently and converting to CSS hex strings where needed
2. Creating a utility type or conversion function to handle both representations
3. Clarifying why this specific interface requires a different representation
🔄 Option 1: Use FigmaColor consistently
 export interface FigmaTopLevelFrame {
     id: string;
     name: string;
     width: number;
     height: number;
-    backgroundColor: string; // CSS hex e.g. "#f0f0f0"
+    backgroundColor: FigmaColor;
 }
Then provide a utility function elsewhere to convert FigmaColor to CSS hex when needed.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @packages/figma/src/types.ts around lines 44 - 50, FigmaTopLevelFrame.backgroundColor is a string while FigmaNode.backgroundColor is FigmaColor, causing type inconsistency; update the type system so backgroundColor is consistent (preferably change FigmaTopLevelFrame.backgroundColor to FigmaColor in types.ts) and add a single conversion utility (e.g., convertFigmaColorToHex) to convert FigmaColor -> CSS hex where needed; update any consumers of FigmaTopLevelFrame or conversion call sites to use the utility or FigmaColor directly.
============================================================================
File: apps/web/client/src/app/login/page.tsx
Line: 79 to 83
Type: potential_issue
Comment:
Hardcoded "or" text bypasses the translation system.
All other user-facing strings use t(transKeys...) but this separator text is hardcoded. This will cause i18n/l10n issues for non-English locales.
🌐 Proposed fix
                     
                         
-                        or
+                        {t(transKeys.welcome.login.or)}
                         
                     
Ensure transKeys.welcome.login.or (or similar) is added to your translation keys.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/login/page.tsx around lines 79 - 83, Replace the hardcoded separator text "or" inside the span (the JSX element with className="text-small text-foreground-tertiary") with the i18n lookup used elsewhere (e.g., t(transKeys.welcome.login.or)), and add the matching translation key (transKeys.welcome.login.or) to your translation files so the separator is localized consistently with other user-facing strings.
============================================================================
File: apps/web/client/src/components/product-quick-view4.tsx
Line: 399 to 401
Type: potential_issue
Comment:
Return null instead of implicit undefined.
Same issue as ProductImages - return null explicitly.
 const ColorRadioGroup = ({ options, field }: RadioGroupProps) => {
-  if (!options) return;
+  if (!options) return null;
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/product-quick-view4.tsx around lines 399 - 401, The ColorRadioGroup component currently returns undefined when options is falsy; update the early exit in the ColorRadioGroup function (signature: const ColorRadioGroup = ({ options, field }: RadioGroupProps) => { ... }) to return null explicitly (i.e., replace the bare return; with return null;) so it mirrors the ProductImages fix and satisfies React's expected JSX return types.
============================================================================
File: apps/web/client/src/components/cta36.tsx
Line: 1 to 9
Type: potential_issue
Comment:
Interface Button shadows the imported Button component; also missing React import.
Two issues here:
1. The local interface Button (line 5) shadows the imported Button component, which can cause confusion and potential TypeScript conflicts.
2. React.ReactNode is referenced on line 8 but React is not imported.
🐛 Proposed fix
 import { Button } from "@/components/ui/button";
+import * as React from "react";
 import { cn } from "@/lib/utils";
-interface Button {
+interface ButtonConfig {
   text: string;
   url: string;
   icon?: React.ReactNode;
 }
 interface Buttons {
-  primary?: Button;
-  secondary?: Button;
+  primary?: ButtonConfig;
+  secondary?: ButtonConfig;
 }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/cta36.tsx around lines 1 - 9, The local interface named Button is shadowing the imported Button component and React is not imported for React.ReactNode; rename the interface to something like ButtonProps or CTAButtonProps and update any references to that new name (e.g., props or function/ component typings), and add an import for React (or import { ReactNode } from "react" and use ReactNode) so the type resolves properly; ensure you update any usages of the interface/props in this file to match the new identifier and remove the naming conflict with the imported Button component.
============================================================================
File: apps/web/client/src/components/cta38.tsx
Line: 5 to 9
Type: potential_issue
Comment:
Interface name Button shadows the imported component, and React is not imported.
Two issues here:
1. The interface Button has the same name as the imported Button component (line 1), which causes a naming conflict and potential confusion.
2. React.ReactNode is used without importing React, which will cause a TypeScript error.
Also, the icon property is defined but never rendered in the component.
🐛 Proposed fix
Add the React import at the top of the file:
+import * as React from "react";
 import { Button } from "@/components/ui/button";
Rename the interface to avoid shadowing:
-interface Button {
+interface ButtonConfig {
   text: string;
   url: string;
   icon?: React.ReactNode;
 }
 interface Buttons {
-  primary?: Button;
-  secondary?: Button;
+  primary?: ButtonConfig;
+  secondary?: ButtonConfig;
 }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/cta38.tsx around lines 5 - 9, Rename the interface named Button to avoid shadowing the imported Button component (e.g., ButtonProps), add the missing React import so React.ReactNode is defined, update the component function signature and usages to use the new ButtonProps type, and ensure the optional icon prop is actually rendered inside the component (e.g., include {icon} in the JSX where appropriate); update any references to the old interface name accordingly.
============================================================================
File: apps/web/client/src/components/help1.tsx
Line: 102 to 126
Type: potential_issue
Comment:
Category cards appear interactive but have no actual click behavior.
The cards have cursor-pointer and hover states, suggesting they're clickable, but there's no onClick handler or wrapping  element. This creates a confusing UX and accessibility issue—keyboard users cannot navigate to these cards.
Consider either:
1. Wrapping each card in a link (requires adding href to HelpCategory interface), or
2. Adding an onClick prop to handle navigation programmatically.
♻️ Proposed fix: Wrap cards in links
First, update the interface:
 interface HelpCategory {
   icon: React.ReactNode;
   title: string;
   description: string;
   articles: number;
+  href: string;
 }
Then wrap the Card:
 {categories.map((category, index) => (
-  
+  
+    
     
       ...
     
   
+  
 ))}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/help1.tsx around lines 102 - 126, The category Card elements (Card / CardContent rendering each category) are styled as interactive but lack click/focus behavior; update the HelpCategory data shape to include a navigation target (e.g., add href or onClick to the HelpCategory interface) and either wrap each Card in a keyboard-focusable link element or attach an onClick and keyboard handlers to the Card (and set role="button" and tabIndex={0}) so the category variable's card becomes reachable and actionable; adjust the mapping where category.title / category.description / category.articles are rendered to use category.href or category.onClick for navigation and ensure aria-labels are preserved for accessibility.
============================================================================
File: apps/web/client/src/components/ui/button.tsx
Line: 51
Type: potential_issue
Comment:
Verify Slot usage - should be Slot not Slot.Root.
With the correct import from @radix-ui/react-slot, the component should use Slot directly, not Slot.Root.
How to use Radix UI Slot component from @radix-ui/react-slot package?
🐛 Proposed fix for Slot usage
-  const Comp = asChild ? Slot.Root : "button"
+  const Comp = asChild ? Slot : "button"
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/button.tsx at line 51, The component currently uses Slot.Root which is incorrect for @radix-ui/react-slot; update the conditional in Button (where const Comp = asChild ? Slot.Root : "button") to use Slot instead (const Comp = asChild ? Slot : "button"), and ensure the file imports Slot from "@radix-ui/react-slot" so the Button component's asChild flow renders the Radix Slot correctly.
============================================================================
File: apps/web/client/src/app/projects/import/figma/_context/index.tsx
Line: 128 to 142
Type: potential_issue
Comment:
Resource leak: provider.destroy() may not be called on error.
If uploadToSandbox or provider.setup throws an exception, the provider.destroy() call is skipped. This could leave connections or resources hanging. Wrap the provider operations in a try/finally to ensure cleanup.
🔧 Proposed fix
             const provider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                 providerOptions: {
                     codesandbox: {
                         sandboxId: forkedSandbox.sandboxId,
                         userId: user.id,
                         initClient: true,
                         keepActiveWhileConnected: false,
                         getSession: async (sandboxId) => startSandbox({ sandboxId }),
                     },
                 },
             });
-            await uploadToSandbox(files, provider);
-            await provider.setup({});
-            await provider.destroy();
+            try {
+                await uploadToSandbox(files, provider);
+                await provider.setup({});
+            } finally {
+                await provider.destroy();
+            }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/projects/import/figma/_context/index.tsx around lines 128 - 142, The CodeSandbox provider created by createCodeProviderClient (CodeProvider.CodeSandbox) can leak resources because provider.destroy() is only called on the success path; wrap the operations that use the provider (uploadToSandbox(files, provider) and provider.setup({})) in a try/finally so that provider.destroy() is always invoked; specifically, after obtaining provider, run uploadToSandbox and provider.setup inside try { ... } and call await provider.destroy() in the finally block, guarding against provider being undefined/null before calling destroy.
============================================================================
File: apps/web/server/src/router/routes/components.ts
Line: 55 to 57
Type: potential_issue
Comment:
Multi-line comments are not stripped.
Exports inside / ... / block comments will still be matched. Consider also stripping block comments:
🔧 Proposed fix
     // Strip single-line comments before applying regexes to avoid matching
     // commented-out exports (e.g. // export const Foo = ...).
-    const stripped = source.replace(/\/\/.*$/gm, '');
+    // Also strip block comments to avoid matching commented-out exports.
+    const stripped = source
+        .replace(/\/\[\s\S]?\*\//g, '')
+        .replace(/\/\/.*$/gm, '');
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/server/src/router/routes/components.ts around lines 55 - 57, The current stripping logic only removes single-line comments via source.replace(/\/\/.$/gm, '') so exports inside block comments (/ ... /) still match; update the preprocessing for the variable stripped to also remove block comments before applying export regexes (e.g., run a replace to strip /\/\[\s\S]?\\//g or use a dedicated comment-strip utility) so both single-line and multi-line comments are removed prior to scanning for exports in the code that references stripped.
============================================================================
File: apps/web/client/src/components/help1.tsx
Line: 149
Type: potential_issue
Comment:
Button has no click handler.
The "Contact Support" button doesn't have an onClick or link behavior. Consider adding an onContactClick prop or wrapping it in a link.
♻️ Proposed fix: Add callback prop
Update props interface:
 interface Help1Props {
   title?: string;
   description?: string;
   categories?: HelpCategory[];
   popularTopics?: PopularTopic[];
   className?: string;
+  onContactClick?: () => void;
+  contactHref?: string;
 }
Then use it:
-Contact Support
+{contactHref ? (
+  
+    Contact Support
+  
+) : (
+  Contact Support
+)}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/help1.tsx at line 149, Add a click handler for the "Contact Support" Button by introducing an optional onContactClick prop on the component's props interface (e.g., onContactClick?: () => void) and wiring it to the Button's onClick (Button in help1.tsx). If you want a default behavior, call the prop if present else open a support link (e.g., window.location.href = 'mailto:support@example.com' or use your router/Link component). Update any consumers to pass onContactClick where needed and ensure the Button remains accessible (e.g., use type="button" if required).
============================================================================
File: apps/web/client/src/components/project1.tsx
Line: 75 to 80
Type: potential_issue
Comment:
Placeholder href="#" and icon dimensions.
The link has a placeholder href="#". If this should navigate externally, consider adding target="_blank" and rel="noopener noreferrer". Also, the icon uses inconsistent dimensions (h-4 w-5); typically icons should be square (size={16} or className="h-4 w-4").
🔧 Proposed fix for external link
           
-            Visit the website 
+            Visit the website
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/project1.tsx around lines 75 - 80, The anchor with placeholder href="#" in the JSX should be updated: if it points to an external site, replace "#" with the real URL, add target="_blank" and rel="noopener noreferrer" on the  element; if it is internal, use your router Link component instead of a plain . Also make the MoveUpRight icon square for consistent sizing by changing its props/classes from className="h-4 w-5" to a square size (e.g., className="h-4 w-4" or size={16}) in the project1 component where the anchor and MoveUpRight are used.
============================================================================
File: apps/web/client/src/components/cta34.tsx
Line: 8
Type: potential_issue
Comment:
Missing React import for React.ReactNode.
React.ReactNode is used but React is not imported, which will cause a TypeScript error.
🔧 Proposed fix
 import { Button } from "@/components/ui/button";
+import type { ReactNode } from "react";
 
 import { cn } from "@/lib/utils";
 
-interface Button {
+interface ButtonConfig {
   text: string;
   url: string;
-  icon?: React.ReactNode;
+  icon?: ReactNode;
 }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/cta34.tsx at line 8, The type annotation icon?: React.ReactNode is used but React is not imported; fix by importing React (or the React types) from 'react' at the top of apps/web/client/src/components/cta34.tsx so the React.ReactNode reference resolves—e.g., add an import like "import React from 'react'" or "import type { ReactNode } from 'react'" and update the prop to icon?: ReactNode if you prefer the typed import.
============================================================================
File: apps/web/client/src/components/product-quick-view4.tsx
Line: 229
Type: potential_issue
Comment:
Dialog lacks controlled state and close handler.
The dialog uses defaultOpen but provides no way to close it or control its state from a parent component. Users will be unable to dismiss the quick view modal.
🔧 Proposed fix: Add controlled open state
-const ProductQuickView4 = ({
+const ProductQuickView4 = ({
+  open = true,
+  onOpenChange,
   images = PRODUCT_DETAILS.images,
   name = PRODUCT_DETAILS.name,
   ...
 }) => {
   ...
   return (
-    
+
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/product-quick-view4.tsx at line 229, The Dialog is uncontrolled (uses defaultOpen) so users can't close it; update the ProductQuickView4 component to manage dialog state either by accepting props (e.g., open: boolean and onOpenChange/onClose: () => void) or by adding local state (const [open, setOpen] = useState(false)) and replace defaultOpen with open={open} and onOpenChange={setOpen} (or a handler that calls onClose). Also wire any close buttons/overlay to call setOpen(false) or onClose so the modal can actually be dismissed; reference Dialog and the ProductQuickView4 component when making these changes.
============================================================================
File: apps/web/client/src/components/download2.tsx
Line: 6 to 31
Type: potential_issue
Comment:
Unused title property in platform interfaces.
The title field is defined for desktop, ios, and android objects but is never rendered in the component. Only subtitle and description are displayed. Either remove the unused title property or use it in the rendered output.
🧹 Option 1: Remove unused title fields
  platforms?: {
    desktop?: {
-     title: string;
      subtitle: string;
      description: string;
      buttonText: string;
      url: string;
    };
    ios?: {
-     title: string;
      subtitle: string;
      description: string;
      url: string;
    };
    android?: {
-     title: string;
      subtitle: string;
      description: string;
      url: string;
    };
  };
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/download2.tsx around lines 6 - 31, The platform objects in Download2Props declare a unused title field for desktop/ios/android; either remove those title properties from the Download2Props interface or update the Download2 component to render the title where platform.subtitle and platform.description are displayed. Locate the Download2Props interface and the Download2 component in download2.tsx and choose one fix: delete title from the desktop/ios/android types to keep the shape minimal, or add rendering for platform.title in the JSX alongside subtitle/description and ensure any styling/spacing matches existing markup.
============================================================================
File: apps/web/client/src/app/login/verify/page.tsx
Line: 75 to 92
Type: potential_issue
Comment:
sendEmailOtp error is not handled.
If sendEmailOtp fails, the user receives no feedback, but the countdown restarts and OTP is cleared. This could confuse users who don't know the resend failed.
🐛 Proposed fix to handle resend errors
 async function handleResend() {
     if (resendCountdown > 0 || isResending) return;
     setIsResending(true);
     setError(null);
-    await sendEmailOtp(email);
+    const result = await sendEmailOtp(email);
     setIsResending(false);
+    if (result?.error) {
+        setError(result.error);
+        return;
+    }
     setResendCountdown(RESEND_COOLDOWN);
     setOtp('');
     // ... interval setup
 }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/login/verify/page.tsx around lines 75 - 92, The handleResend function starts the cooldown and clears the OTP even if sendEmailOtp fails; wrap the await sendEmailOtp(email) call in a try/catch so failures are caught, setError with the caught error message, ensure setIsResending(false) runs in finally (or both paths), and only call setResendCountdown, setOtp(''), and start the intervalRef timer when sendEmailOtp succeeds; reference handleResend, sendEmailOtp, setIsResending, setError, setResendCountdown, setOtp, and intervalRef to locate and adjust the logic.
============================================================================
File: apps/web/server/src/router/routes/components.ts
Line: 28
Type: potential_issue
Comment:
Arrow function regex won't match destructured props with nested objects.
The pattern \([^)]*\) fails on export const Foo = ({ a: { b } }: Props) => ... because it stops at the first ). This is a known limitation of regex-based parsing.
Given the note about regex limitations, this is acceptable but worth documenting.
📝 Suggested comment addition
 // Matches both plain and typed arrow components (optional leading whitespace for indented files):
 //   export const Foo = () => ...
 //   export const Foo: React.FC = ({ children }) => ...
 //   export const Foo: FC = (props) => ...
+// Note: Does not handle deeply nested destructuring in parameters.
 const NAMED_ARROW_RE = /^\sexport\s+const\s+([A-Z][A-Za-z0-9_])(?:\s:\s[^=]+?)?\s=\s(?:\([^)]\)|[A-Za-z_][A-Za-z0-9_])\s(?::\s[^=]+?)?\s*=>/gm;
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/server/src/router/routes/components.ts at line 28, Update the NAMED_ARROW_RE declaration by adding a clear inline comment above it that documents its known limitation: explain that the regex (NAMED_ARROW_RE) uses a simple \([^)]*\) to match parameter lists and therefore will not correctly handle nested/destructured parameters like "export const Foo = ({ a: { b } }: Props) => ..." and that this is an acceptable regex parsing limitation; include an example of a failing case and a note advising that full parsing should use a real JS/TS parser (e.g., TypeScript ESTree) if those cases must be supported.
============================================================================
File: packages/parser/src/code-edit/transform.ts
Line: 64 to 66
Type: potential_issue
Comment:
Guard against undefined structureChanges.
If request.structureChanges is undefined or null, flatMap will fail. Consider adding a filter or nullish coalescing.
🛡️ Proposed fix
     const imports = Array.from(oidToCodeDiff.values())
-        .flatMap((request) => request.structureChanges)
+        .flatMap((request) => request.structureChanges ?? [])
         .flatMap(getImportsFromAction);
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @packages/parser/src/code-edit/transform.ts around lines 64 - 66, The current construction of imports uses Array.from(oidToCodeDiff.values()).flatMap(request => request.structureChanges).flatMap(getImportsFromAction) which will throw if a request's structureChanges is undefined/null; update the chain to guard by filtering or using nullish coalescing so only defined arrays are flattened: when iterating oidToCodeDiff (symbol: oidToCodeDiff) ensure each request (or request.structureChanges) is checked (e.g., filter(Boolean) or replace undefined with []) before calling flatMap(getImportsFromAction) so getImportsFromAction only receives arrays; adjust the imports assignment in transform.ts accordingly to handle missing structureChanges safely.
============================================================================
File: apps/web/client/src/components/ui/button.tsx
Line: 19 to 20
Type: potential_issue
Comment:
Remove invalid dark:dark: prefix in ghost variant.
The ghost variant contains an invalid dark:dark:hover:bg-slate-800/50 modifier that should use a single dark: prefix.
🐛 Proposed fix for the invalid dark prefix
 ghost:
-  "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-100/50 dark:hover:bg-slate-800 dark:hover:text-slate-50 dark:dark:hover:bg-slate-800/50",
+  "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-50",
Note: I've also removed the conflicting dark:hover:bg-slate-100/50 declaration.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/button.tsx around lines 19 - 20, The ghost variant in ui/button.tsx contains an invalid double prefix "dark:dark:hover:bg-slate-800/50" and a conflicting "dark:hover:bg-slate-100/50"; update the ghost variant string in the Button component (ghost variant) to replace "dark:dark:hover:bg-slate-800/50" with a single "dark:hover:bg-slate-800/50" and remove the conflicting "dark:hover:bg-slate-100/50" entry so the dark-mode hover styles are correct and non-duplicative.
============================================================================
File: apps/web/client/src/components/ui/tabs.tsx
Line: 66 to 71
Type: potential_issue
Comment:
Fix duplicate and conflicting Tailwind classes.
Several class issues detected:
1. Line 67: border border-slate-200 border-transparent — border-transparent overrides border-slate-200.
2. Line 67: Multiple dark:dark: prefixes (e.g., dark:dark:text-slate-400) are invalid/redundant.
3. Line 69: Conflicting active backgrounds — dark:data-[state=active]:bg-slate-200/30 followed by dark:data-[state=active]:bg-slate-950 (last one wins, first is dead code).
4. Line 69-70: More dark:dark: prefixes that should be just dark:.
🧹 Proposed cleanup for class conflicts
       className={cn(
-        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-slate-950/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-slate-950 focus-visible:border-slate-950 focus-visible:ring-[3px] focus-visible:ring-slate-950/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-slate-500 dark:hover:text-slate-950 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 dark:border-slate-800 dark:text-slate-50/60 dark:hover:text-slate-50 dark:focus-visible:border-slate-300 dark:focus-visible:ring-slate-300/50 dark:dark:text-slate-400 dark:dark:hover:text-slate-50",
+        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-slate-950/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-slate-950 focus-visible:border-slate-950 focus-visible:ring-[3px] focus-visible:ring-slate-950/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-50 dark:focus-visible:border-slate-300 dark:focus-visible:ring-slate-300/50",
         "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
-        "data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:border-slate-200 dark:data-[state=active]:bg-slate-200/30 dark:data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-950 dark:data-[state=active]:text-slate-50 dark:dark:data-[state=active]:border-slate-800 dark:dark:data-[state=active]:bg-slate-800/30 dark:dark:data-[state=active]:text-slate-50",
+        "data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:border-slate-800 dark:data-[state=active]:bg-slate-800/30 dark:data-[state=active]:text-slate-50",
         "after:absolute after:bg-slate-950 after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100 dark:after:bg-slate-50",
         className
       )}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/tabs.tsx around lines 66 - 71, The className string passed to cn(...) in the Tabs component contains duplicate/conflicting Tailwind classes: remove redundant/overridden entries (e.g., choose either border-slate-200 or border-transparent in the group that contains "border border-slate-200 border-transparent"), eliminate invalid double-dark prefixes ("dark:dark:" → "dark:"), and consolidate conflicting active background rules so only the intended dark/light active bg remains (remove the earlier dead "dark:data-[state=active]:bg-slate-200/30" if "dark:data-[state=active]:bg-slate-950" is desired). Edit the className construction in apps/web/client/src/components/ui/tabs.tsx (the cn(...) call) to prune duplicates, fix prefix typos, and ensure the active state bg/border rules appear once in the correct order.
============================================================================
File: apps/web/client/src/server/api/routers/components.ts
Line: 116 to 122
Type: potential_issue
Comment:
Path traversal protection is insufficient.
The check root.includes('..') can be bypassed with absolute paths. An attacker could pass projectRoot: "/etc" and the scanner would attempt to read /etc/src/. While it only reads .tsx/.jsx files, this still allows filesystem enumeration and could leak information.
🔒 Proposed fix: Validate resolved path is within sandbox
 import { readdir, readFile } from 'fs/promises';
-import { extname, join, relative } from 'path';
+import { extname, join, relative, resolve } from 'path';
 import { z } from 'zod';
 ...
         .query(async ({ input }) => {
             // Use the provided root (for testing / future flexibility) or fall back to the
             // well-known sandbox path. Never allow path traversal.
             const root = input.projectRoot ?? SANDBOX_ROOT;
-            if (root.includes('..')) return [];
+            const resolvedRoot = resolve(root);
+            if (!resolvedRoot.startsWith(SANDBOX_ROOT)) return [];
             const srcDir = join(root, 'src');
             return scanDirectory(srcDir, root);
         }),
Alternatively, if projectRoot should always be SANDBOX_ROOT in production, consider removing the optional input parameter and hardcoding it, exposing a separate test-only procedure if needed.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/server/api/routers/components.ts around lines 116 - 122, The current root validation (root.includes('..')) is insufficient; instead resolve and validate the final path is inside the sandbox before scanning: compute the candidate root from input.projectRoot or SANDBOX_ROOT, use path.resolve/realpath to get an absolute resolvedRoot, then verify with path.relative or startsWith that resolvedRoot is inside the SANDBOX_ROOT realpath (e.g., resolvedRoot === sandboxRealPath or path.relative(sandboxRealPath, resolvedRoot) does not start with '..'); if the check fails return [] or reject the request. Update the logic around input.projectRoot, SANDBOX_ROOT, join, srcDir and the call to scanDirectory to use the validated resolvedRoot (or remove the optional projectRoot input in production if desired).
============================================================================
File: apps/web/client/src/components/ui/button.tsx
Line: 13 to 14
Type: potential_issue
Comment:
Remove invalid dark:dark: prefixes in destructive variant.
The destructive variant contains multiple invalid dark:dark: modifiers. These should be single dark: prefixes.
🐛 Proposed fix for the invalid dark prefixes
 destructive:
-  "bg-red-500 text-white hover:bg-red-500/90 focus-visible:ring-red-500/20 dark:bg-red-500/60 dark:focus-visible:ring-red-500/40 dark:bg-red-900 dark:hover:bg-red-900/90 dark:focus-visible:ring-red-900/20 dark:dark:bg-red-900/60 dark:dark:focus-visible:ring-red-900/40",
+  "bg-red-500 text-white hover:bg-red-500/90 focus-visible:ring-red-500/20 dark:bg-red-900 dark:hover:bg-red-900/90 dark:focus-visible:ring-red-900/20",
Note: I've also removed the duplicate dark mode declarations (dark:bg-red-500/60 dark:focus-visible:ring-red-500/40 followed by dark:bg-red-900).
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/button.tsx around lines 13 - 14, In the destructive variant string (the "destructive" entry in the button variant definitions in apps/web/client/src/components/ui/button.tsx) remove the invalid double-prefixes "dark:dark:" so each dark-mode utility uses a single "dark:" prefix, and also eliminate the redundant duplicate dark-mode declarations (e.g., keep either dark:bg-red-500/60 and its corresponding dark:focus-visible:ring-red-500/40 OR the dark:bg-red-900 variants, not both) so the final "destructive" class string uses only single "dark:" prefixes and no duplicated/conflicting dark utilities.
============================================================================
File: apps/web/client/src/components/ui/button.tsx
Line: 3
Type: potential_issue
Comment:
Fix the Radix UI Slot import path.
The import path "radix-ui" is incorrect. The Radix UI Slot component should be imported from "@radix-ui/react-slot".
What is the correct import path for Radix UI Slot component?
🐛 Proposed fix for the import path
-import { Slot } from "radix-ui"
+import { Slot } from "@radix-ui/react-slot"
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/button.tsx at line 3, The import for the Radix Slot is wrong: replace the incorrect import of Slot from "radix-ui" with the correct package "@radix-ui/react-slot" so the Slot symbol resolves properly; update the import statement that references Slot in the button component to import from "@radix-ui/react-slot" and run type checks to ensure no other usages need adjusting.
============================================================================
File: apps/web/client/src/components/ui/field.tsx
Line: 117 to 122
Type: potential_issue
Comment:
Invalid dark:dark: prefix and conflicting dark mode classes.
Line 120 has a typo with dark:dark: prefix which is invalid. Additionally, there are conflicting background classes in dark mode (dark:has-data-[state=checked]:bg-slate-900/10 vs dark:has-data-[state=checked]:bg-slate-50/5).
🐛 Proposed fix
         "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
         "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4",
-        "has-data-[state=checked]:border-slate-900 has-data-[state=checked]:bg-slate-900/5 dark:has-data-[state=checked]:bg-slate-900/10 dark:has-data-[state=checked]:border-slate-50 dark:has-data-[state=checked]:bg-slate-50/5 dark:dark:has-data-[state=checked]:bg-slate-50/10",
+        "has-data-[state=checked]:border-slate-900 has-data-[state=checked]:bg-slate-900/5 dark:has-data-[state=checked]:border-slate-50 dark:has-data-[state=checked]:bg-slate-50/10",
         className
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/field.tsx around lines 117 - 122, The className string in the Field component contains a typo dark:dark: and conflicting dark-mode background classes; open the className usage in apps/web/client/src/components/ui/field.tsx (the JSX that sets the className prop) and remove the duplicated dark:dark: prefix, then pick a single dark-mode background class for the checked state (for example keep dark:has-data-[state=checked]:bg-slate-900/10 and remove dark:has-data-[state=checked]:bg-slate-50/5 or vice versa) so there are no contradictory dark-mode bg rules; ensure any corresponding dark-mode border classes remain consistent with the chosen background.
============================================================================
File: packages/parser/src/code-edit/transform.ts
Line: 108 to 115
Type: potential_issue
Comment:
Insert position may place imports before directives.
If the file starts with a non-import statement (e.g., 'use client' parsed as ExpressionStatement, or a leading export), the loop breaks immediately and insertIndex remains 0. This would insert new imports before those statements.
Consider scanning past directives/leading statements, or finding the first import and inserting relative to the import block.
babel parser program directives vs body for use client
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @packages/parser/src/code-edit/transform.ts around lines 108 - 115, The current logic uses insertIndex=0 and breaks on the first non-import, which can place new imports before leading directives like 'use client'; instead, advance past leading directive/pragma ExpressionStatements first (check nodes in ast.program.body for ExpressionStatement with a directive or node.directive), then from that position scan the contiguous import block and set insertIndex to the index after the last import (use ast.program.body, t.isImportDeclaration to detect imports). In short: first skip initial directive/pragma nodes, then find the first run of import declarations and set insertIndex to the end of that run before inserting.
============================================================================
File: apps/web/client/src/components/project1.tsx
Line: 60 to 65
Type: potential_issue
Comment:
Inconsistent responsive font sizing and semantic heading usage.
Two issues here:
1. Font sizing regression: text-3xl md:text-2xl lg:text-5xl makes the text smaller on medium screens before enlarging on large screens. This is likely unintended.
2. Semantic HTML: Using both  and  for parts of the same heading is semantically incorrect. Consider using a single heading with styled spans.
🔧 Proposed fix
-            
-              
-                Project
-              
-              
-                Nordic Retreat
-              
+            
+              
+                Project{" "}
+                
+                  Nordic Retreat
+                
+
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/project1.tsx around lines 60 - 65, Replace the two separate headings ( and ) with a single semantic heading (use ) and style inner parts with spans to preserve visual differences; also fix the responsive Tailwind classes so they do not shrink at md — e.g. change the class sequence from "text-3xl md:text-2xl lg:text-5xl" to an increasing sequence like "text-2xl md:text-3xl lg:text-5xl" (apply to the main  and the inner span(s) that used to be ) so sizing scales correctly across breakpoints and heading semantics are correct.
============================================================================
File: apps/web/client/src/components/ui/chart.tsx
Line: 194
Type: potential_issue
Comment:
Duplicate border classes detected.
The className contains border-slate-200 border-slate-200/50 which appears redundant. The second class will override the first. Similarly for dark mode: dark:border-slate-800 dark:border-slate-800/50.
🔧 Proposed fix to remove duplicate border classes
-        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-slate-200 border-slate-200/50 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-slate-800 dark:border-slate-800/50 dark:bg-slate-950",
+        "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-slate-200/50 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-slate-800/50 dark:bg-slate-950",
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/chart.tsx at line 194, In the className string that starts with "grid min-w-[8rem] items-start..." remove the redundant solid border classes and keep the translucent variants: delete border-slate-200 and dark:border-slate-800, leaving border-slate-200/50 and dark:border-slate-800/50; update the string in the Chart component (the className literal shown in apps/web client chart.tsx) so there are no duplicate border-* classes.
============================================================================
File: apps/web/client/src/components/ui/button.tsx
Line: 8
Type: potential_issue
Comment:
Remove invalid dark:dark: prefix in base classes.
The base classes contain an invalid dark:dark:aria-invalid:ring-red-900/40 modifier at the end. Tailwind CSS doesn't support double dark: prefixes; it should be a single dark: prefix.
🐛 Proposed fix for the invalid dark prefix
-  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-slate-950 focus-visible:ring-[3px] focus-visible:ring-slate-950/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 dark:aria-invalid:ring-red-500/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 dark:focus-visible:border-slate-300 dark:focus-visible:ring-slate-300/50 dark:aria-invalid:border-red-900 dark:aria-invalid:ring-red-900/20 dark:dark:aria-invalid:ring-red-900/40",
+  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-slate-950 focus-visible:ring-[3px] focus-visible:ring-slate-950/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 dark:aria-invalid:ring-red-500/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 dark:focus-visible:border-slate-300 dark:focus-visible:ring-slate-300/50 dark:aria-invalid:border-red-900 dark:aria-invalid:ring-red-900/20",
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/button.tsx at line 8, In apps/web/client/src/components/ui/button.tsx remove the invalid double Tailwind prefix in the base class string: find the token "dark:dark:aria-invalid:ring-red-900/40" (inside the class list used by the Button component) and replace it with a single "dark:aria-invalid:ring-red-900/40"; also scan the same file for any other occurrences of "dark:dark:" and fix them to a single "dark:" so Tailwind modifiers are valid.
============================================================================
File: apps/web/server/src/router/routes/components.ts
Line: 138 to 157
Type: potential_issue
Comment:
Critical: Path traversal vulnerability allows reading arbitrary files.
The publicProcedure endpoint allows unauthenticated users to read .tsx/.jsx files from any directory on the server. The path validation is insufficient:
1. The resolve() check is ineffective: After resolve(), paths are normalized and won't contain ... For example, resolve('/etc/../tmp') returns /tmp, which doesn't include ...
2. Absolute paths bypass the check: /etc, /home, or any absolute path passes validation since it doesn't contain ...
3. No authentication: Using publicProcedure exposes this to any caller.
🔒 Proposed fix: Validate against an allowlist
+import { existsSync } from 'fs';
+
+// Define allowed project roots or a base directory
+const ALLOWED_BASE_DIR = process.env.PROJECTS_BASE_DIR || '/app/projects';
+
 export const componentsRouter = router({
-    listProjectComponents: publicProcedure
+    listProjectComponents: protectedProcedure // Require authentication
         .input(
             z.object({
                 projectRoot: z
                     .string()
                     .min(1)
                     .refine((p) => !p.includes('..'), 'Invalid project root path'),
             }),
         )
         .query(async ({ input }) => {
-            // Extra runtime guard: resolve and re-check for traversal sequences after
-            // normalisation (covers encoded or platform-specific edge cases).
             const { resolve } = await import('path');
-            if (resolve(input.projectRoot).includes('..')) {
-                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid project root path' });
-            }
+            const resolvedPath = resolve(ALLOWED_BASE_DIR, input.projectRoot);
+            
+            // Ensure resolved path is still within allowed base directory
+            if (!resolvedPath.startsWith(ALLOWED_BASE_DIR + '/')) {
+                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid project root path' });
+            }
+            
             const srcDir = join(input.projectRoot, 'src');
-            return scanDirectory(srcDir, input.projectRoot);
+            return scanDirectory(resolve(resolvedPath, 'src'), resolvedPath);
         }),
 });
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/server/src/router/routes/components.ts around lines 138 - 157, The listProjectComponents publicProcedure allows path traversal and unlimited reads; replace the weak resolve(...).includes('..') check with a strict allowlist and containment check: require an authenticated procedure (use protectedProcedure instead of publicProcedure), validate input.projectRoot against an allowlist of permitted workspace/project roots, compute the absolute resolvedProjectRoot = path.resolve(allowedBase, input.projectRoot) and resolvedSrc = path.resolve(resolvedProjectRoot, 'src') and ensure path.relative(allowedBase, resolvedProjectRoot) does not start with '..' (i.e. resolvedProjectRoot is contained in the allowed base) before calling scanDirectory; also reject absolute paths that don’t map under an allowed base and keep using scanDirectory only on the validated resolvedSrc.
============================================================================
File: apps/web/client/src/app/projects/import/figma/_components/select-frames.tsx
Line: 64 to 84
Type: potential_issue
Comment:
Add ARIA attributes for checkbox semantics.
These buttons act as checkboxes (toggling selection state) but lack proper ARIA attributes. Screen readers will announce them as regular buttons, not conveying the selection state. This prevents users relying on assistive technology from understanding which frames are selected.
♿ Proposed fix to add proper ARIA attributes
                                         toggleFrame(frame.id)}
+                                           role="checkbox"
+                                           aria-checked={isSelected}
+                                           aria-label={${frame.name}, ${frame.width}×${frame.height}}
                                            className={w-full text-left p-3 border-b last:border-b-0 hover:bg-secondary transition-colors ${isSelected ? 'bg-secondary/50' : ''}}
                                        >
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/projects/import/figma/_components/select-frames.tsx around lines 64 - 84, Buttons acting as selection toggles lack ARIA checkbox semantics; update the button in select-frames.tsx (the element that calls toggleFrame and uses isSelected) to include role="checkbox", aria-checked={isSelected} and a clear accessible name (use aria-label or aria-labelledby referencing the frame name/span) so screen readers convey the checked state and label; keep the onClick handler (toggleFrame) and visual styles the same to preserve behavior.
============================================================================
File: packages/parser/src/code-edit/transform.ts
Line: 89 to 101
Type: potential_issue
Comment:
Inconsistent comparison between imported.name and local.name.
Lines 89-92 extract imported.name for named imports (e.g., Foo from import { Foo as Bar }), but line 100 compares against local.name (which would be Bar). This mismatch can cause duplicate imports when aliases are involved.
🔧 Proposed fix for consistent comparison
     const hasImport = ast.program.body.some((node) => {
         if (!t.isImportDeclaration(node) || node.source.value !== source) {
             return false;
         }
-        return importedNames.every((name) =>
-            node.specifiers.some((specifier) => specifier.local.name === name),
+        return importedNames.every((name) =>
+            node.specifiers.some((specifier) => {
+                const existingName =
+                    t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported)
+                        ? specifier.imported.name
+                        : specifier.local.name;
+                return existingName === name;
+            }),
         );
     });
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @packages/parser/src/code-edit/transform.ts around lines 89 - 101, The check for existing imports mixes imported.name with local.name which breaks when imports are aliased; change the collected names to consistently use the specifier.local.name (i.e., build importedNames from importDeclaration.specifiers using specifier.local.name) and then keep the hasImport logic that compares those local names against node.specifiers.local.name so aliasing is respected (update references to importedNames, importDeclaration, specifier.imported, and specifier.local accordingly).
============================================================================
File: packages/ai/test/prompt/data/create-page-system.txt
Line: 30
Type: potential_issue
Comment:
Fix the tag concatenation on this line.
The closing  tag and opening  tag are concatenated on the same line without proper separation. This creates poor readability and may cause parsing issues.
📝 Proposed fix to separate tags
-- CSS background images: use url('/path.png') with the same public/ → / conversion.Installed shadcnblocks available in this project:
+- CSS background images: use url('/path.png') with the same public/ → / conversion.
+
+
+
+Installed shadcnblocks available in this project:
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @packages/ai/test/prompt/data/create-page-system.txt at line 30, The line contains concatenated HTML tags "" which should be separated for readability and correct parsing; update the text so the closing tag "" and the opening tag "" are on separate tokens (e.g., add a space or newline between them) wherever the string is defined so that the tags are distinct and not merged.
============================================================================
File: apps/web/client/src/components/kibo-ui/code-block/index.tsx
Line: 537 to 544
Type: potential_issue
Comment:
Bug: .split("") splits by character, not by line.
The fallback renders each character as a separate "line" instead of splitting code by newlines. This will produce incorrect output (e.g., const x = 1 becomes 12 separate "lines" with one character each).
🐛 Proposed fix
       
         {children
           ?.toString()
-          .split("")
+          .split("\n")
           .map((line, i) => (
             
               {line}
             
           ))}
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/kibo-ui/code-block/index.tsx around lines 537 - 544, The current fallback splits children by character because it uses .split(""), causing each character to render as its own ; change the split to use newline boundaries (e.g., .split(/\r?\n/) or .split("\n")) so the mapping in the JSX maps over lines rather than characters, keeping the existing map callback (span with key={i}) and preserving handling when children is null/undefined; update the snippet where children?.toString().split("") is used to children?.toString().split(/\r?\n/).
============================================================================
File: apps/web/client/src/app/projects/import/figma/_components/select-frames.tsx
Line: 96
Type: potential_issue
Comment:
Handle potential errors from async nextStep().
The void operator discards the promise returned by nextStep(), which means any errors thrown will be silently swallowed. If the import fails, users won't receive error feedback, creating a poor experience.
🛡️ Proposed fix to handle promise rejections
-                 void nextStep()} disabled={!canImport || isFinalizing}>
+                 {
+                    try {
+                        await nextStep();
+                    } catch (error) {
+                        console.error('Failed to create project:', error);
+                        // Consider showing user-facing error toast/notification
+                    }
+                }} disabled={!canImport || isFinalizing}>
                     Create Project
                 
Alternatively, if error handling is managed within nextStep() itself, remove the wrapper:
-                 void nextStep()} disabled={!canImport || isFinalizing}>
+                
                     Create Project
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/projects/import/figma/_components/select-frames.tsx at line 96, The onClick currently uses the void operator to ignore the promise from nextStep(), which swallows rejections; change the Button onClick to an async handler that awaits nextStep() inside a try/catch (or calls nextStep().catch(...)) and surface failures to the user (e.g., set component error state or show a toast/notification) so import errors aren't silent; alternatively, if nextStep() already handles its own errors, remove the void wrapper and call nextStep() directly. Refer to the nextStep function and the Button onClick in select-frames.tsx and ensure disabled logic using canImport and isFinalizing remains unchanged.
============================================================================
File: apps/web/client/src/components/kibo-ui/code-block/index.tsx
Line: 396 to 401
Type: potential_issue
Comment:
Add type guard for children before regex test.
children is typed as ReactNode, so calling regex.test(children as string) could cause runtime errors if children is not a string (e.g., if it's undefined, an array, or a React element).
🛡️ Proposed fix to add type guard
   const defaultIcon = Object.entries(filenameIconMap).find(([pattern]) => {
+    if (typeof children !== "string") {
+      return false;
+    }
     const regex = new RegExp(
       ^${pattern.replace(/\\/g, "\\\\").replace(/\./g, "\\.").replace(/\/g, ".")}$
     );
-    return regex.test(children as string);
+    return regex.test(children);
   })?.[1];
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/kibo-ui/code-block/index.tsx around lines 396 - 401, The current logic that computes defaultIcon uses Object.entries(filenameIconMap) and runs regex.test(children as string) but children is a ReactNode and may not be a string; add a type guard before running the regex: ensure children is a non-empty string (e.g., typeof children === "string" && children.length > 0) or coerce JSX/text children appropriately, then run the RegExp test; update the computation around defaultIcon (and the RegExp creation) to skip testing when children is not a string so you avoid runtime errors when children is undefined, an array, or a React element.
============================================================================
File: apps/web/client/src/components/ui/button.tsx
Line: 15 to 16
Type: potential_issue
Comment:
Remove invalid dark:dark: prefixes in outline variant.
The outline variant contains multiple invalid dark:dark: modifiers that should be single dark: prefixes.
🐛 Proposed fix for the invalid dark prefixes
 outline:
-  "border bg-white shadow-xs hover:bg-slate-100 hover:text-slate-900 dark:border-slate-200 dark:bg-slate-200/30 dark:hover:bg-slate-200/50 dark:bg-slate-950 dark:hover:bg-slate-800 dark:hover:text-slate-50 dark:dark:border-slate-800 dark:dark:bg-slate-800/30 dark:dark:hover:bg-slate-800/50",
+  "border bg-white shadow-xs hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-950 dark:border-slate-800 dark:bg-slate-800/30 dark:hover:bg-slate-800 dark:hover:bg-slate-800/50 dark:hover:text-slate-50",
Note: I've also consolidated the duplicate dark mode declarations.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/button.tsx around lines 15 - 16, The outline variant string in the Button component contains invalid duplicated modifiers like "dark:dark:border-slate-800" and "dark:dark:bg-slate-800/30"; edit the outline value in apps/web/client/src/components/ui/button.tsx (the outline variant constant/string) to remove the extra "dark:" so each dark-mode class uses a single "dark:" prefix and consolidate any duplicate dark-mode declarations (e.g., merge repeated dark:hover/bg or dark:border entries) to keep a single, correct set of dark:... classes.
============================================================================
File: apps/web/client/messages/en.d.json.ts
Line: 125
Type: potential_issue
Comment:
Consider using a pluralization-friendly format for the countdown.
The hardcoded "s" suffix in "Resend in {seconds}s" may not work well for internationalization. In English, "1s" reads awkwardly compared to "1 second", and other languages have different pluralization rules.
🌐 Suggested approach for better i18n support
If next-intl supports ICU MessageFormat, consider:
-"resendIn": "Resend in {seconds}s"
+"resendIn": "Resend in {seconds, plural, one {# second} other {# seconds}}"
Alternatively, handle pluralization in the code and pass a pre-formatted string, or use separate keys for singular/plural if the framework supports it.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/messages/en.d.json.ts at line 125, Update the "resendIn" message key to use ICU pluralization instead of a hardcoded "s" suffix so translations render correctly for singular/plural and other locales; change the value of the "resendIn" key in apps/web/client/messages/en.d.json.ts to an ICU MessageFormat that pluralizes based on the seconds variable (referencing the "resendIn" key and the {seconds} placeholder) and ensure the calling code still passes a numeric seconds value to that message.
============================================================================
File: apps/web/client/src/components/ui/select.tsx
Line: 39 to 41
Type: potential_issue
Comment:
Fix duplicate dark:dark: prefixes.
Line 40 contains invalid Tailwind classes with duplicate dark: prefixes that won't apply correctly:
- dark:dark:bg-slate-800/30
- dark:dark:hover:bg-slate-800/50
- dark:dark:aria-invalid:ring-red-900/40
🐛 Proposed fix
-        "flex w-fit items-center justify-between gap-2 rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-slate-950 focus-visible:ring-[3px] focus-visible:ring-slate-950/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 data-[placeholder]:text-slate-500 data-[size=default]:h-9 data-[size=sm]:h-8 :data-[slot=select-value]:line-clamp-1 :data-[slot=select-value]:flex :data-[slot=select-value]:items-center :data-[slot=select-value]:gap-2 dark:bg-slate-200/30 dark:hover:bg-slate-200/50 dark:aria-invalid:ring-red-500/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class='size-'])]:size-4 [&_svg:not([class='text-'])]:text-slate-500 dark:border-slate-800 dark:focus-visible:border-slate-300 dark:focus-visible:ring-slate-300/50 dark:aria-invalid:border-red-900 dark:aria-invalid:ring-red-900/20 dark:data-[placeholder]:text-slate-400 dark:dark:bg-slate-800/30 dark:dark:hover:bg-slate-800/50 dark:dark:aria-invalid:ring-red-900/40 dark:[&_svg:not([class*='text-'])]:text-slate-400",
+        "flex w-fit items-center justify-between gap-2 rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-slate-950 focus-visible:ring-[3px] focus-visible:ring-slate-950/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 data-[placeholder]:text-slate-500 data-[size=default]:h-9 data-[size=sm]:h-8 :data-[slot=select-value]:line-clamp-1 :data-[slot=select-value]:flex :data-[slot=select-value]:items-center :data-[slot=select-value]:gap-2 dark:bg-slate-800/30 dark:hover:bg-slate-800/50 dark:aria-invalid:ring-red-500/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class='size-'])]:size-4 [&_svg:not([class='text-'])]:text-slate-500 dark:border-slate-800 dark:focus-visible:border-slate-300 dark:focus-visible:ring-slate-300/50 dark:aria-invalid:border-red-900 dark:aria-invalid:ring-red-900/20 dark:data-[placeholder]:text-slate-400 dark:[&_svg:not([class*='text-'])]:text-slate-400",
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/ui/select.tsx around lines 39 - 41, The Tailwind class string passed to the cn call (className prop in the Select component) contains invalid duplicate dark: prefixes—specifically the tokens "dark:dark:bg-slate-800/30", "dark:dark:hover:bg-slate-800/50", and "dark:dark:aria-invalid:ring-red-900/40"; remove the extra "dark:" so they become "dark:bg-slate-800/30", "dark:hover:bg-slate-800/50", and "dark:aria-invalid:ring-red-900/40" respectively (leave all other classes and spacing intact) in the className value to restore correct Tailwind behavior.
============================================================================
File: apps/web/client/src/app/login/verify/page.tsx
Line: 61 to 65
Type: potential_issue
Comment:
Potential open redirect vulnerability.
The returnUrl is taken directly from URL search params and used in router.push(). An attacker could craft a malicious URL like /verify?email=victim@example.com&returnUrl=https://evil.com to redirect users to a phishing site after successful verification.
Validate that returnUrl is a relative path or belongs to an allowed list of domains before redirecting.
🛡️ Proposed fix to validate returnUrl
+function isValidReturnUrl(url: string): boolean {
+    // Only allow relative paths starting with /
+    return url.startsWith('/') && !url.startsWith('//');
+}
+
 async function handleVerify(value: string) {
     // ... existing code ...
     if (result.error) {
         setError(result.error);
         setOtp('');
         return;
     }
-    if (returnUrl) {
+    if (returnUrl && isValidReturnUrl(returnUrl)) {
         router.push(returnUrl);
     } else {
         router.push(result.redirectTo ?? Routes.AUTH_REDIRECT);
     }
 }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/login/verify/page.tsx around lines 61 - 65, The code uses the raw returnUrl from search params in router.push (see returnUrl and router.push) which allows open redirects; update the redirect logic in the verification handler to validate returnUrl before pushing: accept only safe relative paths (e.g., start with "/") or check the hostname against an allowlist of trusted domains (parse with the URL constructor), and if validation fails fall back to Routes.AUTH_REDIRECT or result.redirectTo; ensure the same validation is applied to result.redirectTo if it can contain external URLs.
============================================================================
File: apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/templates.ts
Line: 46 to 53
Type: potential_issue
Comment:
Add accessibility attributes to interactive elements.
Buttons and links in the templates lack accessibility attributes:
1. Buttons (lines 46-53, 87-101, 220-227, 301-308) should include:
   - type: 'button' attribute (prevents unintended form submission)
   - Consider aria-label for clearer screen reader announcements
2. Anchor tags (lines 297-299) use placeholder href: '#' which creates non-functional links. These should either:
   - Use meaningful href values, or
   - Be converted to buttons if they trigger actions rather than navigation
🎯 Proposed fix for button accessibility
Example for lines 46-53:
 {
     tagName: 'button',
     styles: {
         padding: '0.75rem 2rem', backgroundColor: '#000', color: '#fff',
         borderRadius: '0.5rem', fontSize: '1rem', fontWeight: '500',
         cursor: 'pointer', border: 'none',
     },
     textContent: 'Get started',
+    attributes: { type: 'button' },
 },
Apply similar pattern to all button elements in the templates.
Also applies to: 87-101, 220-227, 297-309
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/templates.ts around lines 46 - 53, Templates define interactive elements with tagName: 'button' (occurrences around the button blocks that set textContent 'Get started' and the other buttons) and an anchor with href: '#' — add type: 'button' to every button element object and include a descriptive aria-label (e.g., aria-label: 'Get started' or context-specific label) to improve screen reader output; for the anchor(s) using href: '#' either supply a real href or convert the element to tagName: 'button' with the appropriate action and aria-label if it performs an in-app action, ensuring all interactive elements include accessibility attributes and prevent accidental form submissions.
============================================================================
File: apps/web/client/src/components/kibo-ui/code-block/index.tsx
Line: 501 to 506
Type: potential_issue
Comment:
Potential state update on unmounted component.
The setTimeout on line 505 isn't cleaned up if the component unmounts, which could cause a React warning when setIsCopied(false) is called after unmount.
🛡️ Proposed fix using useEffect cleanup or ref
+import { useRef } from "react";
+
 export const CodeBlockCopyButton = ({
   asChild,
   onCopy,
   onError,
   timeout = 2000,
   children,
   className,
   ...props
 }: CodeBlockCopyButtonProps) => {
   const [isCopied, setIsCopied] = useState(false);
+  const timeoutRef = useRef>();
   const { data, value } = useContext(CodeBlockContext);
   const code = data.find((item) => item.language === value)?.code;
+  useEffect(() => {
+    return () => {
+      if (timeoutRef.current) {
+        clearTimeout(timeoutRef.current);
+      }
+    };
+  }, []);
+
   const copyToClipboard = () => {
     if (
       typeof window === "undefined" ||
       !navigator.clipboard.writeText ||
       !code
     ) {
       return;
     }
     navigator.clipboard.writeText(code).then(() => {
       setIsCopied(true);
       onCopy?.();
-      setTimeout(() => setIsCopied(false), timeout);
+      timeoutRef.current = setTimeout(() => setIsCopied(false), timeout);
     }, onError);
   };
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/src/components/kibo-ui/code-block/index.tsx around lines 501 - 506, The setTimeout used inside the navigator.clipboard.writeText success handler can call setIsCopied(false) after the component unmounts; update the CodeBlock component (file: apps/web/client/src/components/kibo-ui/code-block/index.tsx) to store the timeout ID (e.g., via a useRef like copyTimeoutRef) when calling setTimeout inside the navigator.clipboard.writeText.then(...) block and clear that timeout in a useEffect cleanup (or clear on unmount) to avoid calling setIsCopied after unmount; ensure you still call setIsCopied(true) and onCopy() on success, but clearTimeout(copyTimeoutRef.current) in cleanup and when starting a new copy action to prevent leaks.
============================================================================
File: apps/web/client/public/onlook-preload-script.js
Line: 45
Type: potential_issue
Comment:
Skip non-CORS images in the DOM screenshot fallback.
The fallback renderer catches drawImage() failures, but cross-origin images usually taint the canvas silently and only fail later at toDataURL(). In pages with CDN/user-hosted images, that turns the whole screenshot into the "Screenshot unavailable" placeholder.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/public/onlook-preload-script.js at line 45, The screenshot fallback currently draws all images and a cross-origin image can silently taint the canvas causing toDataURL() to fail; update the captureScreenshot function (symbol: dx) to filter out or skip non-CORS images before drawing: detect IMG elements (and background-image URLs) whose src/origin differs from location.origin and which do not have a valid crossorigin="anonymous" (or whose fetch would require credentials), exclude them from the draw loop (or replace with a safe placeholder) so the canvas never becomes tainted, and keep a small debug log when skipping images; ensure you still attempt CORS-enabled images (set crossOrigin where possible) and only call canvas.toDataURL() after drawing the filtered set.
============================================================================
File: apps/web/client/public/onlook-preload-script.js
Line: 45
Type: potential_issue
Comment:
Do not overwrite the host app’s global window.onerror.
This preload replaces window.onerror instead of chaining or using addEventListener("error", ...). Since it runs inside the page context, it can clobber the app’s own error monitoring and make production failures harder to diagnose.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/public/onlook-preload-script.js at line 45, The preload currently overwrites the page's global window.onerror handler; instead locate where window.onerror is assigned and replace that assignment with window.addEventListener('error', handler) (and window.addEventListener('unhandledrejection', handler) for promise rejections), or if you must support older code, preserve and call any existing handler by storing const prevOnError = window.onerror and invoking prevOnError(...args) inside your new handler. Search for direct writes to window.onerror in this file (e.g., around the top-level initialization / connection setup functions like k4, I4 or any global initialization blocks) and change them to use addEventListener or the chaining-preserve pattern so you do not clobber the host app's error monitoring.
============================================================================
File: apps/web/client/public/onlook-preload-script.js
Line: 45
Type: potential_issue
Comment:
Lock the Penpal bridge to trusted parent origins.
allowedOrigins:["*"] means any embedding origin can handshake with this frame and call privileged methods like captureScreenshot, DOM mutation, drag/edit operations, and theme reads/writes. This bridge needs an explicit allowlist or a verified parent origin derived from trusted config, not a wildcard.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/public/onlook-preload-script.js at line 45, The Penpal bridge currently allows any origin via allowedOrigins:["*"] when constructing the penpal connection (see the new j$({...}) call inside k4 and the e3() helper that selects the parent window); replace the wildcard with a strict allowlist or derive a single trusted origin from your trusted configuration (or from a verified parent origin) and pass that array to allowedOrigins, and additionally validate the remote origin before exposing privileged methods (i.e., ensure the penpal handshake only completes for origins in your allowlist in the promise resolution inside k4).
============================================================================
File: apps/web/client/public/onlook-preload-script.js
Line: 45
Type: potential_issue
Comment:
Make Gu() idempotent before exposing it remotely.
Gu() is both auto-run during bootstrap and exposed as handleBodyReady, but it has no one-time guard. Every extra call adds another MutationObserver and resize listener, so DOM/resize events will start firing N times.
♻️ Suggested guard
+let hasInitialized = false;
+
 function Gu(){
+  if (hasInitialized) return;
+  hasInitialized = true;
   Cx(),lj(),ot.injectDefaultStyles()
 }
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @apps/web/client/public/onlook-preload-script.js at line 45, Gu() currently creates MutationObserver and resize listeners on every call, causing duplicate observers when invoked again (it's exported as handleBodyReady); make Gu idempotent by adding a one-time guard (e.g., a module-scoped boolean like bodyReadyInitialized or storing the created observer/handler and returning early if set), ensure subsequent calls no-op and do not add new MutationObserver or window resize listeners, and keep the exported handleBodyReady routing to the same guarded Gu so remote callers can safely call it multiple times.
============================================================================
File: docs/superpowers/plans/2026-05-03-drag-drop-components-panel.md
Line: 1254 to 1260
Type: refactor_suggestion
Comment:
Incomplete implementation placeholder requires specific guidance.
The getTargetFileForLocation method returns null with a TODO comment. While this is acceptable for a planning document, the placeholder provides no specific guidance on how to implement this critical function.
Consider adding more specific implementation hints:
private async getTargetFileForLocation(location: InsertLocation): Promise {
    // Implementation steps:
    // 1. Extract the oid or domId from the location object
    // 2. Look up the corresponding element in editorEngine.state or editorEngine.ast
    // 3. Find which source file that element belongs to
    // Likely pattern: return this.editorEngine.ast.getFilePathForOid(location.domId);
    // Or: return this.editorEngine.state.activeFile?.path;
    
    // Search for existing patterns:
    // - grep for "getFileFor" or "resolveFile" in the editor store
    // - Check how INSERT_ELEMENT action determines the target file
    
    return null; // Replace after finding the correct API
}
Additionally, add this as a verification step: Ensure the implementation is completed before testing Task 7, as component insertion will silently fail if this returns null.
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @docs/superpowers/plans/2026-05-03-drag-drop-components-panel.md around lines 1254 - 1260, The getTargetFileForLocation placeholder must map the InsertLocation to a source file: extract the oid/domId (e.g., location.domId or location.oid), query the editor model (use this.editorEngine.ast.getFilePathForOid or similar AST/store helper; alternatively check this.editorEngine.state for a file lookup or this.editorEngine.state.activeFile?.path), and return that file path or null if not found; search the repo for methods like getFileForOid/getFilePathForOid/resolveFile to match the correct API and implement the lookup used by INSERT_ELEMENT so component insertion succeeds (ensure you complete this before running Task 7 as insertion will silently fail if it returns null).
============================================================================
File: docs/superpowers/plans/2026-05-03-drag-drop-components-panel.md
Line: 1 to 1341
Type: potential_issue
Comment:
Plan structure is solid, but critical implementation gaps need resolution before execution.
This is a well-organized implementation plan with good incremental structure and testing steps. However, several critical issues must be addressed before agents execute this plan:
Critical Issues:
1. Path traversal security vulnerability (Task 5, line 969)
2. Browser incompatibility with require('path') (Task 7, line 1266)
3. Incomplete getTargetFileForLocation implementation (Task 7, line 1259)
Recommendations:
1. Fix the security and compatibility issues identified in the detailed comments above
2. For Task 7, either provide complete implementation guidance or add a pre-step to discover and document the file resolution API
3. Consider adding error handling guidance for:
   - Babel parse failures on malformed source files
   - Missing permissions when scanning directories
   - Component insertion failures (e.g., invalid drop locations)
Strengths to maintain:
- Clear task boundaries with verification steps
- Comprehensive test coverage planning
- Good use of checkboxes for progress tracking
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @docs/superpowers/plans/2026-05-03-drag-drop-components-panel.md around lines 1 - 1341, The plan's code has three concrete issues to fix: (1) Path traversal in scanDirectory/extractReactComponents: ensure file paths are constrained to the provided projectRoot (reject any resolved path that escapes projectRoot via path.resolve + path.relative and skip if relative starts with '..'), validate extensions strictly and catch/log errors for readFile/parse; (2) Browser-incompatible use of require('path') in insert/store code: replace runtime require with an explicit top-level import of Node's path module (import path from 'path') or move computeRelativeImportPath to server-side code that runs in Node (never call require in client code), and normalize/strip extensions using path methods; (3) Missing getTargetFileForLocation implementation: implement by reusing the existing editorEngine APIs used elsewhere — e.g., lookup the element oid at InsertLocation via editorEngine.dom/ast (search for methods like getSourceFileForOid, editorEngine.ast.getFileForOid, or editorEngine.project.getFilePathForOid), return that file path or null if unresolved, and add robust error handling and fallbacks; also add explicit error handling around Babel parsing, unreadable files, and failed insertions to return empty arrays or surface warnings rather than throwing.
============================================================================
File: docs/superpowers/plans/2026-05-03-drag-drop-components-panel.md
Line: 1263 to 1271
Type: potential_issue
Comment:
Browser incompatibility: require('path') will fail in client code.
The computeRelativeImportPath function uses Node.js's path module via require(), but this code runs in the browser (client-side) where Node.js modules are not available. This will cause a runtime error.
🔧 Browser-compatible alternatives
Option 1: Implement simple browser-compatible path logic
function computeRelativeImportPath(fromFile: string, toComponentFile: string): string {
    const fromParts = fromFile.split('/').slice(0, -1); // directory of fromFile
    const toParts = toComponentFile.split('/');
    
    // Find common prefix
    let commonLength = 0;
    while (
        commonLength
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @docs/superpowers/plans/2026-05-03-drag-drop-components-panel.md around lines 1263 - 1271, The computeRelativeImportPath function is using Node's require('path') which breaks in browser code; replace it with a browser-safe implementation or move the computation to server-side. Update the computeRelativeImportPath function to use string-based path logic (split by '/', find common prefix, build ../ segments, strip extensions) or instead compute the import path on the server and return it via listProjectComponents/ComponentInsertData; ensure the exported/used symbol computeRelativeImportPath (or the server endpoint that supplies it) is updated and all callers use the new browser-compatible value.
============================================================================
File: docs/superpowers/plans/2026-05-03-drag-drop-components-panel.md
Line: 965 to 972
Type: potential_issue
Comment:
Path traversal vulnerability: Validate and sanitize projectRoot input.
The projectRoot input is used directly in file system operations without validation against path traversal attacks. An attacker could provide values like ../../etc/passwd to read arbitrary files on the server.
🔒 Proposed security fix
Add path validation before using the input:
+import { resolve, normalize } from 'path';
+
 export const componentsRouter = router({
     listProjectComponents: protectedProcedure
         .input(z.object({ projectRoot: z.string().min(1) }))
         .query(async ({ input }) => {
+            // Validate projectRoot is within allowed workspace
+            const normalizedRoot = normalize(resolve(input.projectRoot));
+            
+            // Define allowed workspace directory (adjust based on your setup)
+            const allowedWorkspace = resolve(process.env.WORKSPACE_ROOT ?? '/workspace');
+            
+            if (!normalizedRoot.startsWith(allowedWorkspace)) {
+                throw new Error('Invalid project path: outside allowed workspace');
+            }
+            
+            // Additional check: ensure path exists and is a directory
+            try {
+                const stats = await stat(normalizedRoot);
+                if (!stats.isDirectory()) {
+                    throw new Error('Invalid project path: not a directory');
+                }
+            } catch {
+                throw new Error('Invalid project path: does not exist');
+            }
+            
-            const srcDir = join(input.projectRoot, 'src');
+            const srcDir = join(normalizedRoot, 'src');
             return scanDirectory(srcDir, input.projectRoot);
         }),
 });
Prompt for AI Agent:
Verify each finding against the current code and only fix it if needed.
In @docs/superpowers/plans/2026-05-03-drag-drop-components-panel.md around lines 965 - 972, Validate and sanitize the projectRoot input in the componentsRouter -> listProjectComponents handler before using it to build srcDir and call scanDirectory: resolve and normalize the path (e.g., using path.resolve), ensure it is inside an allowed base/workspace directory (compare with path.relative or startsWith the canonical base), reject or throw on any path that contains traversal outside the workspace (e.g., resolving to a path that does not start with the workspace root) or is not a directory, and only then compute srcDir and call scanDirectory(projectRootResolved, workspaceRoot) so arbitrary paths like ../../etc/passwd cannot be read.
Review completed: 109 findings ✔

