'use client';

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@weblab/ui/breadcrumb';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@weblab/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@weblab/ui/table';

import { Section } from '../section';

export function DataDisplayDemo() {
    return (
        <div id="data">
            <Section
                title="Table"
                tag="data"
                inspectId="table"
                filePath="packages/ui/src/components/table.tsx"
            >
                <div className="border-border overflow-hidden rounded-xl border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Last edited</TableHead>
                                <TableHead className="text-right">Size</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {[
                                ['Homepage', 'Published', '2 hours ago', '12.4 KB'],
                                ['Pricing', 'Draft', 'Yesterday', '8.1 KB'],
                                ['Blog index', 'Published', '3 days ago', '24.0 KB'],
                                ['Changelog', 'Published', '1 week ago', '32.7 KB'],
                            ].map(([name, status, edited, size]) => (
                                <TableRow key={name}>
                                    <TableCell>{name}</TableCell>
                                    <TableCell>
                                        <span
                                            className={
                                                status === 'Published'
                                                    ? 'text-foreground-success'
                                                    : 'text-foreground-warning'
                                            }
                                        >
                                            {status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-foreground-tertiary">
                                        {edited}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {size}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Section>

            <Section
                title="Pagination"
                tag="data"
                inspectId="pagination"
                filePath="packages/ui/src/components/pagination.tsx"
            >
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious href="#" />
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationLink href="#">1</PaginationLink>
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationLink href="#" isActive>
                                2
                            </PaginationLink>
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationLink href="#">3</PaginationLink>
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationEllipsis />
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationLink href="#">12</PaginationLink>
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationNext href="#" />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </Section>

            <Section
                title="Breadcrumb"
                tag="data"
                inspectId="breadcrumb"
                filePath="packages/ui/src/components/breadcrumb.tsx"
            >
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="#">Workspace</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink href="#">Projects</BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>Weblab</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </Section>
        </div>
    );
}
