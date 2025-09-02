document.addEventListener('DOMContentLoaded', () => {
  console.log('🛒 Script filter');

  if (PUB_SUB_EVENTS && typeof subscribe === 'function') {
    subscribe(PUB_SUB_EVENTS.tbCollectionFiltered, (event) => {
      console.log(event)
      dddd(event)
      
    });
  } else {
    console.warn('⚠️ PUB_SUB_EVENTS o subscribe no disponibles');
  }


});

async function dddd(event) {
    console.log('estoy en dddd')
    await fetch('/cart/update.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                attributes: { productsFiltered: event.data.productsFiltered }
              })
            });
        function handleResponse() {
    JSON.parse(this.responseText);
    }

    const request = new XMLHttpRequest();

    request.addEventListener('load', handleResponse);
    request.open('GET', '/?section_id=tb-product-grid', true);
    request.send();
}
