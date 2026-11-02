<template>
  <form class="change-password" @submit.prevent="save">
    <label>Current password</label>
    <input v-model="form.current" type="password" autocomplete="current-password" /> <!-- @expect secret block -->
    <label>New password</label>
    <input v-model="form.next" :type="reveal ? 'text' : 'password'" /> <!-- @expect secret block -->
    <div class="strength" :style="{ width: strength + '%' }"></div> <!-- @expect secret block -->
    <label>Recovery email</label>
    <input v-model="form.recovery" type="email" /> <!-- @expect personal mask -->
    <p>Signed in as {{ me.username }}</p> <!-- @expect personal mask -->
  </form>
</template>
