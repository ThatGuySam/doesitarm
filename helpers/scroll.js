

export function scrollHorizontalCarousel ( event ) {
    event.stopPropagation()

    // console.log('event.target', event.currentTarget)
    // console.log('distance', event.currentTarget.getAttribute('distance'))

    const distance = Number(event.currentTarget.getAttribute('distance'))
    const scrollTarget = document.querySelector(event.currentTarget.getAttribute('scroll-target'))

    scrollTarget.scrollBy({ left: distance, behavior: 'smooth' })
}
