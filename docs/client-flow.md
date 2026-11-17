# Client flow: draft 1

*17.11.2026. Screens and taps only. The visual mock follows once Dim picks
the look (decisions page, `look`). Altegio's flow is in kickoff §3. This
draft keeps its logic and cuts its taps.*

## Target

| Visit | Altegio today | Ours |
|---|---|---|
| First visit | about 9 taps + name and phone | **4 taps** + name and phone |
| Returning, from a link | the same 9 | **2 taps** |

## Entry points

| From | Link | Lands on |
|---|---|---|
| A barber card on rempire.ee | `/{locale}/b/{staff-slug}` | Screen 1, that barber already picked. Altegio drops the barber here. |
| Any other «book now» | `/{locale}` | Screen 1, nothing picked |
| «Book again» in a confirmation, reminder or the done screen | `/{locale}/again/{token}` | Screen 2, same barber and services, details pre-filled |

`{locale}` is `ru`, `et` or `en`, taken from the rempire.ee page the client
came from. A switcher sits in the header.

## Screens

### 1. Who and what (one screen, not two)

- **Barbers:** a row of photo chips. The first is «Anyone · earliest». Each
  shows ★ and the review count, as Altegio does.
- **Services:** a list under the chips. Each row shows duration and price.
  Several can be ticked.
- Tapping a barber first narrows the services and shows **that barber's**
  prices.
- Tapping a service first narrows the barbers and shows each one's price.
  - One screen covers both of Altegio's flows, barber-first and
    service-first.
- A bar at the bottom shows the total time and price. It turns into «Choose
  a time» once there is at least one service.
- **Taps:** barber (1), service (2). No «Continue»: picking a service with a
  barber moves on by itself.

### 2. When

- On top, **the earliest free slot** as one big button, for example «Thu
  26.11 · 11:15».
- Below it, a strip of the next 14 days. Days with no free time are greyed
  out.
- Under that, the chosen day's slots, grouped Morning / Day / Evening.
- **A full day says why** and offers the next free date, as Altegio does.
- **Taps:** a slot (3).

### 3. Your details

- **Name** and **phone**. The phone starts at +372 and accepts any country.
- E-mail (optional, it gets the confirmation and the `.ics`).
- Comment (optional).
- Reminder: «SMS 2 hours before», on by default with a switch to turn it off.
  The time is fixed, not Altegio's 17-option dropdown.
  - SMS goes out only as this reminder (kickoff §8).
- A short privacy line under the button. No consent checkbox.
  - Booking data is processed to deliver the booking, so a notice is enough
    and saves a tap.
  - Have it checked once against the privacy policy text.
- The browser remembers the client's own details on that device, so the
  next visit is pre-filled.
  - Never look a name up by the phone typed in: anyone could type someone
    else's number and see their name.
- **Taps:** «Book» (4).

### 4. Done

- A summary: barber, date and time, services, total, address.
- «Add to calendar» (`.ics`).
- «Change or cancel», which works until the cutoff. **[open]** Renat Q7 sets
  the cutoff. After it, the button shows the salon's phone number.
- If deposits come in (Renat Q6), the payment step sits between screens 3
  and 4.

## Returning client: 2 taps

The confirmation, the reminder and the done screen carry «Book again».

1. The link opens screen 2 with the same barber and services. The earliest
   slot is the big button. Tap it, or tap another slot (1).
2. Screen 3 is already filled in. Tap «Book» (2).

## Edge cases the mock must show

- The barber has no free time in the next 60 days: «Ask for a slot» shows
  the salon's phone number, and offers «Anyone».
- A slot is taken while the client types: «This time was just taken», with
  the nearest three other slots on that screen. The database constraint
  makes this safe (data-model.md).
- The page is open past midnight or across a DST change: times always come
  from the server, in Tallinn time.
