<template>
  <section class="container">
    <div>
      <h1 class="title">
        {{ app.name }}
      </h1>
      <h2 class="subtitle">
        {{ app.text }}
      </h2>
      <div class="links">
        <a
          :href="app.url"
          target="_blank"
          class="button--green">Download</a>
      </div>
    </div>
  </section>
</template>

<script>
import Logo from '~/components/Logo.vue'
import buildAppList from '~/helpers/build-app-list'

export default {
    components: {
        Logo
    },
    async asyncData ({ params: { slug }, error, payload }) {

        const appList = (payload) ? payload : await buildAppList()

        return {
            slug,
            appList
        }
    },
    computed: {
        app () {
            // console.log('context', this.slug)
            return this.appList.find(app => (app.slug === this.slug))
        }
    }
}
</script>

<style>
/* Sample `apply` at-rules with Tailwind CSS
.container {
  @apply min-h-screen flex justify-center items-center text-center mx-auto;
}
*/

.container {
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
}

.title {
    font-family: 'Quicksand', 'Source Sans Pro', -apple-system,
        BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
        sans-serif;
    display: block;
    font-weight: 300;
    font-size: 100px;
    color: #35495e;
    letter-spacing: 1px;
}

.subtitle {
    font-weight: 300;
    font-size: 42px;
    color: #526488;
    word-spacing: 5px;
    padding-bottom: 15px;
}

.links {
    padding-top: 15px;
}
</style>
