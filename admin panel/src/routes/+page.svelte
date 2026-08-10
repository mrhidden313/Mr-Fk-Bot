<script>
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

    onMount(() => {
        // Redirect based on stored tokens
        const adminToken = localStorage.getItem('adminToken');
        const userToken = localStorage.getItem('userToken');

        if (adminToken) {
            goto('/admin/dashboard');
        } else if (userToken) {
            goto('/dashboard');
        } else {
            goto('/login');
        }
    });
</script>

<div class="loading-screen">
    <div class="loader"></div>
    <p>Loading...</p>
</div>

<style>
    .loading-screen {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        color: #64748b;
        font-size: 0.875rem;
    }
    .loader {
        width: 36px; height: 36px;
        border: 3px solid rgba(20,184,166,0.2);
        border-top-color: #14b8a6;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
