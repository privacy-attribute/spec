<template>
  <div class="contact-card">
    <img :src="contact.photo" :alt="contact.name" /> <!-- @expect third-party mask -->
    <h3>{{ contact.fullName }}</h3> <!-- @expect third-party mask -->
    <p class="email">{{ contact.email }}</p> <!-- @expect third-party mask -->
    <p :title="contact.address">Address on file</p> <!-- @expect third-party mask -->
    <div class="note" v-html="contact.noteHtml"></div> <!-- @expect third-party mask -->
    <span>{{ owner }}</span> <!-- @expect third-party mask -->
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ contact: Contact }>();
const owner = computed(() => props.contact.accountOwner);
</script>
