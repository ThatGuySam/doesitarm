import Layout from '@/components/layout/default.js'

function NotFound( props = {} ) {
    return (
        <Layout>
            <div>Not Found</div>
            <div>Props</div>
            <pre>{ JSON.stringify(props, null, '\t') }</pre>
        </Layout>
    )
}

export default NotFound
