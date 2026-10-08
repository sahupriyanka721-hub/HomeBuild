# HomeBuild — Full-Stack Home Services & Construction Marketplace

HomeBuild is a full-stack platform for customers, administrators, architects/professionals and material vendors.

## Implemented modules

### Customer
- Service selection: new construction, renovation, house map/naksha, 2D/3D design, interior, exterior, structural design, repair/modification and construction labour
- Requirement form: name, mobile, city/location, plot size/location, floors, BHK, budget, details, start date and document/photo metadata
- Request for Quotation
- My Requirements and request IDs
- Multiple professional quotations
- Quotation comparison: price, rating, experience, delivery, revisions, services, portfolio/review count
- Select & Book
- Project lifecycle tracking:
  Quotation Selected → Booking Confirmed → Payment → Work Started → Work in Progress → Design Submitted → Revision → Approved → Completed
- Payment recording
- Project chat
- Documents
- Reviews/ratings
- Material marketplace
- Material requirement request
- Multiple vendor material quotations
- Vendor selection and material orders
- Payment/order history

### Admin
- Dashboard statistics
- Customer/professional management
- New requirement inbox
- Requirement details
- Assign one requirement to multiple associated professionals
- Quotations/bookings/material orders visibility through API
- Disputes
- Commission records
- Reports/analytics

### Architect / Professional
- Assigned requirements
- Itemized quotation builder:
  design, 2D, 3D, elevation, structural charges, GST, revisions, delivery, services, terms
- My quotations
- Active project tracking
- Documents
- Project chat

### Vendor
- Product catalogue
- Price and stock
- City/serving area
- Material requirements from customers
- Material quotation submission
- Material orders
- Delivery/payment workflow

## Tech
- React + Vite
- Node.js + Express
- SQLite + better-sqlite3
- JWT authentication

## Local run
```bash
npm run install:all
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:5000
Health: http://localhost:5000/api/health

## Demo accounts
Password: `password123`

- customer@homebuild.test
- architect@homebuild.test
- vendor@homebuild.test
- admin@homebuild.test

## Production notes
For a real commercial launch, replace local SQLite/file storage with managed PostgreSQL and object storage, add OTP/email notifications, Razorpay/Stripe webhooks, rate limiting, audit logs, real-time notifications, and production-grade role/permission policies.
