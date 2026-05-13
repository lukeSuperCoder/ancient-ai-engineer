<script setup lang="ts">
import ChatShell from "./components/ChatShell.vue";
</script>

<template>
  <!-- App 保持很薄，只负责渲染主业务页面，方便后续接路由或全局 Provider。 -->
  <ChatShell />
</template>
