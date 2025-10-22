var map = DC.map('map').setView([38.9072,77.0369])

DC.tileLayer('https://tile.openstreetmap.org/{}/{x}/{y}.png?{foo}', {foo: 'bar', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);