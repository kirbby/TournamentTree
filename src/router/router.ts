import {
    createRouter,
    createWebHistory,
    RouteRecordRaw
} from "vue-router";

const TreePage = () => import("@/pages/TreePage.vue");
const SetupPage = () => import("@/pages/SetupPage.vue");

const routes: Array<RouteRecordRaw> = [
    {
        path: "/",
        redirect: "/setup",
    },
    {
        path: "/tree",
        name: "tree",
        component: TreePage,
    },
    {
        path: "/setup",
        name: "SetupPage",
        component: SetupPage,
    },
];

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
});

export default router;
