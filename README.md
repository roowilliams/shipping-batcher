# shipping-batcher

Built for a specific use case of fulfilling shipments of pre-ordered zines. This script takes a CSV of orders, purchases shipping using easypost.com at the lowest rate (Media Mail in my case) and generates a PDF of 4x6 pre-paid shipping labels for printing.

## Installation

1. Create an account at easypost.com and get an API key (recommend test to start).
2. Create a .env file in the project root directory with `EASYPOST_API_KEY=YOURAPIRKEY` on the first line.
3. Rename config-example.js to config.js and update the address details with the sender's address.
4. Create a ./labels directory.
5. Run index.js
