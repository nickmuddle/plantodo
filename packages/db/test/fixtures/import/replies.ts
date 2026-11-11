// What a model would plausibly return for each fixture, written by hand. These
// stand in for the model in tests; they are not recorded from a real run.

const none = { meal: null, cuisine: null, category: null, mode: null, carrier: null, service_number: null };
const base = {
  notes: null,
  url: null,
  day: null,
  date: null,
  start_time: null,
  end_time: null,
  place_query: null,
  end_place_query: null,
  details: none,
};

export const chatgptDays = {
  items: [
    { ...base, kind: 'stay', title: 'Memmo Alfama Hotel', day: 1, place_query: 'Memmo Alfama Hotel, Lisbon', notes: 'Drop bags from 2pm.' },
    { ...base, kind: 'do', title: 'Alfama lanes and Miradouro de Santa Luzia', day: 1, start_time: '15:00', place_query: 'Miradouro de Santa Luzia, Lisbon', details: { ...none, category: 'Viewpoint' } },
    { ...base, kind: 'do', title: 'São Jorge Castle', day: 1, place_query: 'São Jorge Castle, Lisbon', url: 'https://castelodesaojorge.pt/en/tickets', notes: 'Late afternoon. Book tickets online.', details: { ...none, category: 'Castle' } },
    { ...base, kind: 'eat', title: 'Dinner at Cervejaria Ramiro', day: 1, start_time: '20:00', place_query: 'Cervejaria Ramiro, Lisbon', notes: 'Classic seafood spot. Go for the garlic prawns.', details: { ...none, meal: 'dinner', cuisine: 'Seafood' } },
    { ...base, kind: 'transport', title: 'Tram 15 to Belém', day: 2, start_time: '09:30', place_query: 'Praça da Figueira, Lisbon', end_place_query: 'Belém, Lisbon', details: { ...none, mode: 'transit', service_number: '15' } },
    { ...base, kind: 'do', title: 'Jerónimos Monastery', day: 2, place_query: 'Jerónimos Monastery, Lisbon', details: { ...none, category: 'Monastery' } },
    { ...base, kind: 'eat', title: 'Custard tarts at Pastéis de Belém', day: 2, place_query: 'Pastéis de Belém, Lisbon', details: { ...none, meal: 'snack' } },
    { ...base, kind: 'eat', title: 'Lunch at Time Out Market', day: 2, start_time: '13:00', place_query: 'Time Out Market, Lisbon', details: { ...none, meal: 'lunch' } },
    { ...base, kind: 'do', title: 'Fado at Tasca do Chico', day: 2, place_query: 'Tasca do Chico, Bairro Alto, Lisbon', notes: 'Evening. Arrive before 8 to get a seat.', details: { ...none, category: 'Music' } },
    { ...base, kind: 'transport', title: 'Train to Sintra', day: 3, start_time: '08:40', place_query: 'Rossio Station, Lisbon', end_place_query: 'Sintra Station, Sintra', notes: 'About 40 minutes.', details: { ...none, mode: 'train' } },
    { ...base, kind: 'do', title: 'Pena Palace', day: 3, place_query: 'Pena Palace, Sintra', notes: 'Morning.', details: { ...none, category: 'Palace' } },
    { ...base, kind: 'do', title: 'Quinta da Regaleira', day: 3, place_query: 'Quinta da Regaleira, Sintra', notes: 'After lunch. Back in Lisbon by 6.' },
    { ...base, kind: 'note', title: 'Tips', notes: 'Buy a Viva Viagem card for trams and metro. Lisbon is hilly: bring comfortable shoes.' },
  ],
};

export const table = {
  items: [
    { ...base, kind: 'stay', title: 'Hotel Gracery Shinjuku', date: '2027-04-03', start_time: '15:00', place_query: 'Hotel Gracery Shinjuku, Tokyo', notes: 'Ref HG-48213' },
    { ...base, kind: 'eat', title: 'Yakitori dinner at Omoide Yokocho', date: '2027-04-03', start_time: '19:00', end_time: '21:00', place_query: 'Omoide Yokocho, Shinjuku, Tokyo', notes: 'Cash only.', details: { ...none, meal: 'dinner', cuisine: 'Yakitori' } },
    { ...base, kind: 'do', title: 'Senso-ji temple', date: '2027-04-04', start_time: '09:00', place_query: 'Senso-ji, Asakusa, Tokyo', details: { ...none, category: 'Temple' } },
    { ...base, kind: 'do', title: 'teamLab Planets', date: '2027-04-04', start_time: '13:30', place_query: 'teamLab Planets, Toyosu, Tokyo', notes: 'Tickets booked for 4.' },
    { ...base, kind: 'transport', title: 'Shinkansen to Kyoto', date: '2027-04-05', start_time: '10:12', end_time: '12:27', place_query: 'Tokyo Station, Tokyo', end_place_query: 'Kyoto Station, Kyoto', notes: 'Reserved seats, car 7.', details: { ...none, mode: 'train', carrier: 'JR Central', service_number: 'Nozomi 215' } },
    { ...base, kind: 'stay', title: 'The Thousand Kyoto', date: '2027-04-05', start_time: '15:00', place_query: 'The Thousand Kyoto, Kyoto' },
    { ...base, kind: 'do', title: 'Fushimi Inari shrine', date: '2027-04-06', start_time: '08:00', place_query: 'Fushimi Inari Taisha, Kyoto', notes: 'Go early to avoid crowds.', details: { ...none, category: 'Shrine' } },
    { ...base, kind: 'eat', title: 'Ramen lunch at Ichiran', date: '2027-04-06', start_time: '12:30', place_query: 'Ichiran Kyoto Kawaramachi, Kyoto', details: { ...none, meal: 'lunch', cuisine: 'Ramen' } },
  ],
};

export const prose = {
  items: [
    { ...base, kind: 'transport', title: 'Flight to New York', date: '2027-06-12', start_time: '08:25', end_time: '11:20', place_query: 'Heathrow Airport, London', end_place_query: 'JFK Airport, New York', details: { ...none, mode: 'flight', carrier: 'British Airways', service_number: 'BA 117' } },
    { ...base, kind: 'transport', title: 'Cab into Manhattan', date: '2027-06-12', place_query: 'JFK Airport, New York', end_place_query: 'Arlo NoMad, New York', details: { ...none, mode: 'taxi' } },
    { ...base, kind: 'stay', title: 'Arlo NoMad', date: '2027-06-12', place_query: 'Arlo NoMad, New York', notes: '11 E 31st St. Booked through booking.com, 4 nights.' },
    { ...base, kind: 'eat', title: 'Pizza near the hotel', date: '2027-06-12', notes: 'First evening. Nothing booked.', details: { ...none, meal: 'dinner', cuisine: 'Pizza' } },
    { ...base, kind: 'do', title: 'High Line and Chelsea Market', notes: 'Saturday morning.', place_query: 'The High Line, New York' },
    { ...base, kind: 'do', title: 'MoMA', start_time: '14:00', notes: 'Saturday. Tickets are timed.', place_query: 'Museum of Modern Art, New York', details: { ...none, category: 'Museum' } },
    { ...base, kind: 'eat', title: 'Dinner at Via Carota', start_time: '19:30', notes: 'Sunday. Sam booked it.', place_query: 'Via Carota, New York', details: { ...none, meal: 'dinner' } },
    { ...base, kind: 'note', title: 'Sort travel insurance', notes: 'Someone needs to sort travel insurance before we go.' },
  ],
};
