'use client';

import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { Button } from '@weblab/ui/button';

import type { BundledLanguage } from '@/components/kibo-ui/code-block';
import {
    CodeBlock,
    CodeBlockBody,
    CodeBlockContent,
    CodeBlockCopyButton,
    CodeBlockFilename,
    CodeBlockFiles,
    CodeBlockHeader,
    CodeBlockItem,
} from '@/components/kibo-ui/code-block';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface CodeSnippet {
    language: string;
    label: string;
    filename: string;
    code: string;
}

const defaultCodeSnippets: CodeSnippet[] = [
    {
        language: 'javascript',
        label: 'Javascript',
        filename: 'utils.js',
        code: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function debounce(func, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};`,
    },
    {
        language: 'python',
        label: 'Python',
        filename: 'utils.py',
        code: `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

def debounce(func, delay):
    import threading
    timer = None
    def wrapper(*args, **kwargs):
        nonlocal timer
        if timer:
            timer.cancel()
        timer = threading.Timer(delay, func, args, kwargs)
        timer.start()
    return wrapper

def memoize(func):
    cache = {}
    def wrapper(*args):
        if args not in cache:
            cache[args] = func(*args)
        return cache[args]
    return wrapper`,
    },
    {
        language: 'go',
        label: 'Go',
        filename: 'utils.go',
        code: `package utils

func Fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    return Fibonacci(n-1) + Fibonacci(n-2)
}

func Filter[T any](slice []T, predicate func(T) bool) []T {
    result := make([]T, 0)
    for _, item := range slice {
        if predicate(item) {
            result = append(result, item)
        }
    }
    return result
}

func Map[T, U any](slice []T, transform func(T) U) []U {
    result := make([]U, len(slice))
    for i, item := range slice {
        result[i] = transform(item)
    }
    return result
}`,
    },
    {
        language: 'ruby',
        label: 'Ruby',
        filename: 'utils.rb',
        code: `def fibonacci(n)
  return n if n <= 1
  fibonacci(n - 1) + fibonacci(n - 2)
end

def debounce(delay, &block)
  @timer&.cancel
  @timer = Thread.new do
    sleep(delay)
    block.call
  end
end

def memoize(method_name)
  cache = {}
  define_method(method_name) do |*args|
    cache[args] ||= super(*args)
  end
end`,
    },
];

interface CodeExample1Props {
    tagline?: string;
    heading?: string;
    headingHighlight?: string;
    description?: string;
    buttonText?: string;
    buttonUrl?: string;
    codeSnippets?: CodeSnippet[];
    className?: string;
}

const CodeExample1 = ({
    tagline = './install.sh',
    heading = 'WRITE CODE.',
    headingHighlight = 'SHIP FASTER.',
    description = 'Build modern applications with clean, reusable code. Our SDK provides powerful utilities that work across multiple languages.',
    buttonText = 'Get started',
    buttonUrl = '#',
    codeSnippets = defaultCodeSnippets,
    className,
}: CodeExample1Props) => {
    const [selectedLanguage, setSelectedLanguage] = useState(
        codeSnippets[0]?.language ?? 'javascript',
    );

    return (
        <section className={cn('py-32', className)}>
            <div className="container">
                <div className="grid place-items-center gap-10 lg:grid-cols-2 lg:gap-0">
                    <div className="flex flex-col gap-6 lg:pr-20">
                        <span className="text-lg text-slate-500 dark:text-slate-400">
                            {tagline}
                        </span>
                        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
                            {heading}
                            <br />
                            <span className="text-slate-500 dark:text-slate-400">
                                {headingHighlight}
                            </span>
                        </h2>
                        <p className="text-slate-500 md:text-lg dark:text-slate-400">
                            {description}
                        </p>
                        <Button asChild size="pill" className="w-fit">
                            <a href={buttonUrl}>
                                {buttonText}
                                <ArrowUpRight className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                    <div className="flex w-full flex-col gap-1 overflow-hidden">
                        <Tabs value={selectedLanguage} onValueChange={setSelectedLanguage}>
                            <TabsList className="h-10 w-full">
                                {codeSnippets.map((snippet) => (
                                    <TabsTrigger key={snippet.language} value={snippet.language}>
                                        {snippet.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <CodeBlock data={codeSnippets} value={selectedLanguage} className="w-full">
                            <CodeBlockHeader>
                                <CodeBlockFiles>
                                    {(item) => (
                                        <CodeBlockFilename
                                            key={item.language}
                                            value={item.language}
                                        >
                                            {item.filename}
                                        </CodeBlockFilename>
                                    )}
                                </CodeBlockFiles>
                                <CodeBlockCopyButton
                                    onCopy={() => console.log('Copied code to clipboard')}
                                    onError={() => console.error('Failed to copy code clipboard')}
                                />
                            </CodeBlockHeader>
                            <ScrollArea className="w-full">
                                <CodeBlockBody>
                                    {(item) => (
                                        <CodeBlockItem
                                            key={item.language}
                                            value={item.language}
                                            className="max-h-96 w-full"
                                        >
                                            <CodeBlockContent
                                                language={item.language as BundledLanguage}
                                            >
                                                {item.code}
                                            </CodeBlockContent>
                                        </CodeBlockItem>
                                    )}
                                </CodeBlockBody>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </CodeBlock>
                    </div>
                </div>
            </div>
        </section>
    );
};

export { CodeExample1 };
