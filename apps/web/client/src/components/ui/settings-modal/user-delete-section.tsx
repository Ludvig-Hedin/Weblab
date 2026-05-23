'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';

import { isClerkMode, useSafeClerk } from '@/utils/auth/safe-clerk';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { signOutEverywhere } from '@/utils/auth/sign-out';

export const UserDeleteSection = observer(() => {
    const router = useRouter();
    const { signOut: clerkSignOut } = useSafeClerk();
    const user = useQuery(api.users.me);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [showFinalDeleteConfirm, setShowFinalDeleteConfirm] = useState(false);

    const handleDeleteAccount = () => {
        setShowDeleteModal(true);
    };

    const handleDeleteConfirm = () => {
        setShowDeleteModal(false);
        setShowFinalDeleteConfirm(true);
    };

    const handleFinalDeleteAccount = async () => {
        try {
            // TODO(convex): users.delete mutation not yet implemented in Convex.
            // Original tRPC: api.user.delete.useMutation()
            toast.error('Account deletion is temporarily unavailable. Please contact support.');
            return;
            // await handleDeleteSuccess();
        } catch (error) {
            toast.error('Failed to delete account');
            console.error('Failed to delete account', error);
        }
    };

    const handleDeleteSuccess = async () => {
        toast.success('Account deleted successfully');

        // Reset form
        setShowFinalDeleteConfirm(false);
        setDeleteEmail('');
        setDeleteConfirmText('');

        // `clerkSignOut` is a no-op in supabase mode (see useSafeClerk).
        await signOutEverywhere(isClerkMode() ? () => clerkSignOut() : undefined);
        router.push(getSignInUrlClient());
    };

    const canProceedWithDelete = deleteEmail === user?.email && deleteConfirmText === 'DELETE';

    return (
        <>
            {/* Delete Account Section */}
            <div className="flex items-center justify-between py-4">
                <div className="space-y-1">
                    <p className="text-regularPlus font-medium">Delete Account</p>
                    <p className="text-small text-muted-foreground">
                        Permanently delete your account and all associated data
                    </p>
                </div>
                <Button variant="destructive" size="sm" onClick={handleDeleteAccount}>
                    Delete
                </Button>
            </div>

            {/* Delete Account Confirmation Modal */}
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Delete account - are you sure?</DialogTitle>
                        <DialogDescription asChild className="pt-2">
                            <div className="space-y-2">
                                <p>Deleting your account will:</p>
                                <div className="text-regular space-y-1">
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5">•</span>
                                        <span>
                                            Permanently delete your account and prevent you from
                                            creating new projects.
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5">•</span>
                                        <span>
                                            Delete all of your projects from {APP_NAME}'s servers.
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5">•</span>
                                        <span>
                                            You cannot create a new account using the same email
                                            address.
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5">•</span>
                                        <span>
                                            This will also permanently delete your chat history and
                                            other data associated with your account.
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5">•</span>
                                        <span>
                                            Deleting an account does not automatically cancel your
                                            subscription or entitled set of paid features.
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="mt-0.5">•</span>
                                        <span>This is final and cannot be undone.</span>
                                    </div>
                                </div>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="delete-email">Please type your account email:</Label>
                            <Input
                                id="delete-email"
                                type="email"
                                value={deleteEmail}
                                onChange={(e) => setDeleteEmail(e.target.value)}
                                placeholder={user?.email || ''}
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="delete-confirm">
                                To proceed, type "DELETE" in the input field below:
                            </Label>
                            <Input
                                id="delete-confirm"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                className="w-full"
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex-col gap-3 sm:flex-row sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowDeleteModal(false);
                                setDeleteEmail('');
                                setDeleteConfirmText('');
                            }}
                            className="order-2 sm:order-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={!canProceedWithDelete}
                            className="order-1 sm:order-2"
                        >
                            {canProceedWithDelete ? 'Delete Account' : 'Locked'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Final Delete Confirmation Modal */}
            <Dialog open={showFinalDeleteConfirm} onOpenChange={setShowFinalDeleteConfirm}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Final confirmation</DialogTitle>
                        <DialogDescription className="pt-2">
                            This is your last chance to cancel. Are you absolutely sure you want to
                            permanently delete your account and all associated data?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-col gap-3 sm:flex-row sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowFinalDeleteConfirm(false);
                                setDeleteEmail('');
                                setDeleteConfirmText('');
                            }}
                            className="order-2 sm:order-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void handleFinalDeleteAccount()}
                            className="order-1 sm:order-2"
                        >
                            Yes, Delete My Account
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
});
