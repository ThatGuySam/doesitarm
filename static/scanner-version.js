const notice = document.querySelector( '.scanner-version-notice' )
const dismiss = notice?.querySelector( 'button' )

if ( dismiss ) {
    dismiss.hidden = false
    dismiss.addEventListener( 'click', () => {
        const heading = document.querySelector( 'main h1' )
        notice.hidden = true
        if ( heading ) {
            heading.tabIndex = -1
            heading.focus()
        }
    } )
}
