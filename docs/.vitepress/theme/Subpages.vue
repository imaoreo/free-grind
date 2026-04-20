<script setup lang="ts">
import type { DefaultTheme } from "vitepress";

defineProps<{
	items: DefaultTheme.SidebarItem[];
}>();
</script>

<template>
	<ul>
		<li v-for="item in items" :key="item.link ?? item.text">
			<a v-if="item.link" :href="item.link">{{ item.text }}</a>
			<span v-else>{{ item.text }}</span>
		</li>
	</ul>
</template>
