export function errorHandler(error: unknown) {
    try {
        console.error('Error in chat', error);
        return 'An unexpected error occurred while streaming chat.';
    } catch (error) {
        console.error('Error in errorHandler', error);
        return 'An unexpected error occurred while streaming chat.';
    }
}
