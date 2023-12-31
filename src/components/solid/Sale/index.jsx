import { createEffect, createMemo, createSignal } from "solid-js";
import { validateEmail } from "@/lib/validate";
import { reserve } from "@/lib/queries/reserve";
import { fullfill } from "@/lib/queries/fullfill";
import { addPeople } from "@/lib/supabase/addPeople";
import { getAvailableSpots } from "@/lib/gets/getAvailableSpots";
import { useTime } from "../signals/useTime";
import { price, baseFee, tentPrice, pageNames } from "./info";
import { nanoid } from "nanoid";

import { Button, Spinner } from "../base";
import { Side } from "./Side";
import { ConfirmAge } from "./pages/ConfirmAge";
import { Tents } from "./pages/Tents";
import { TicketInfos } from "./pages/TicketInfos";
import { Tickets } from "./pages/Tickets";
import { Billing } from "./pages/Billing";
import { Confirm } from "./pages/Confirm";
import { Done } from "./pages/Done";

export const Sale = () => {
  const time = useTime();
  const spots = getAvailableSpots();

  const [page, setPage] = createSignal(0);
  const [disabled, setDisabled] = createSignal(false);

  const [place, setPlace] = createSignal(-1);

  const [shareEmail, setShareEmail] = createSignal(false);
  const [sharedEmail, setSharedEmail] = createSignal("");

  const [creditCard, setCreditCard] = createSignal("");
  const [expiration, setExpiration] = createSignal("");
  const [cvv, setCvv] = createSignal("");

  const [isReserving, setIsReserving] = createSignal(false);
  const [isFullfilling, setIsFullfilling] = createSignal(false);

  const [reserveInfo, setReserveInfo] = createSignal(null);

  const [people, setPeople] = createSignal({
    regular: 0,
    vip: 0,
  });

  const [infos, setInfos] = createSignal({
    regular: {},
    vip: {},
  });

  const [emails, setEmails] = createSignal({
    regular: {},
    vip: {},
  });

  const [tents, setTents] = createSignal({
    type: 0,
    count: 0,
  });

  const totalPeople = createMemo(() =>
    Object.values(people()).reduce((acc, val) => acc + val, 0),
  );

  const realPrice = createMemo(() => {
    const values = people();
    const tent = tents();

    return (
      Object.keys(values).reduce(
        (acc, key) => acc + values[key] * price[key],
        0,
      ) +
      tentPrice[tent.type] * tent.count +
      baseFee
    );
  });

  const emailsValid = createMemo(() => {
    const isShared = shareEmail();
    const shared = sharedEmail();
    const e = emails();
    const p = people();

    if (isShared) return validateEmail(shared.trim());

    return Object.keys(e).every((key) =>
      new Array(p[key])
        .fill(null)
        .every((_, index) => validateEmail(e[key][index])),
    );
  });

  const infosValid = createMemo(() => {
    const i = infos();
    const p = people();

    return Object.keys(i).every((key) =>
      new Array(p[key])
        .fill(null)
        .every(
          (_, index) => i[key][index]?.firstName && i[key][index]?.lastName,
        ),
    );
  });

  const billingValid = createMemo(() => {
    const c = creditCard() || "";
    const e = expiration() || "";
    const cv = cvv() || "";

    return c.length >= 10 && e.length == 5 && cv.length == 3;
  });

  const reservationValid = createMemo(() => {
    const info = reserveInfo();

    if (!info) return false;

    return info.when + info.result.timeout >= time();
  });

  const isDisabled = createMemo(() => {
    return (
      disabled() ||
      place() < 0 ||
      totalPeople() === 0 ||
      (page() === 0 && spots().value[place()].available < totalPeople()) ||
      (page() === 2 && (!emailsValid() || !infosValid())) ||
      (page() === 4 && !billingValid()) ||
      (page() === 5 && !reservationValid()) ||
      isReserving() ||
      isFullfilling()
    );
  });

  const onNext = async () => {
    if (isDisabled()) return;

    let nextPage = page() + 1;
    const peeps = totalPeople();

    if (nextPage === 1 && (peeps < 2 || (peeps % 2 !== 0 && peeps % 3 !== 0))) {
      nextPage++;
    }

    let set = true;

    if (nextPage === 5) {
      setIsReserving(true);

      try {
        const result = await reserve(
          spots().value[place()].area,
          totalPeople(),
        );

        if (!result.id)
          throw new Error(`Error while reserving. ${result.message}`);

        setReserveInfo({
          result,
          when: Date.now() - 5000,
        });
      } catch (error) {
        // TODO: Show error
        console.log(error);
        set = false;
      }

      setIsReserving(false);
    }

    if (nextPage === 6) {
      setIsFullfilling(true);

      try {
        const id = reserveInfo().result.id;

        const result = await fullfill(id);

        if (result.message !== "Reservation completed")
          throw new Error(`Error while fullfilling. ${result.message}`);

        const p = people();
        const i = infos();
        const e = emails();

        const sharing = shareEmail();
        const shared = sharedEmail();

        const supaResult = await addPeople(
          Object.keys(p).reduce((acc, type) => {
            const people = new Array(p[type]).fill(null).map((_, index) => ({
              firstname: i[type][index].firstName.trim(),
              lastname: i[type][index].lastName.trim(),
              mail: (sharing ? shared : e[type][index]).trim(),
              vip: type === "vip",
              id: nanoid(),
              orderid: id,
            }));

            return [...acc, ...people];
          }, []),
        );

        if (supaResult.error)
          throw new Error(
            `Error while writing to supabase. ${supaResult.error.message}`,
          );

        console.log(id);
      } catch (error) {
        // TODO: Show error
        console.log(error);
        set = false;
      }

      setIsFullfilling(false);
    }

    if (set) setPage(nextPage);
  };

  createEffect(() => {
    if (place() !== -1) return;
    if (!spots().value) return;

    setPlace(0);
  });

  return (
    <div class="w-full max-w-[600px]">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <h2 class="mb-2 text-center text-2xl">
          <a href="https://milk-foofest.vercel.app/">
            <img
              alt="Place"
              src="/svgs/foo-festival-logo.svg"
              class="mx-auto h-10 sm:mx-0"
            />
          </a>
        </h2>

        <div>
          <p class="mb-1 text-right text-lg font-medium">
            {page() + 1}. {pageNames[page()]}
          </p>

          <div class="h-1.5 w-full rounded-full bg-gray-700">
            <div
              class="h-1.5 rounded-full bg-peach transition-[width]"
              style:width={`${(page() / 6) * 100}%`}
            ></div>
          </div>
        </div>

        <div class="order-2 flex flex-col gap-2 sm:order-none">
          <Side
            {...{
              spots,
              place: [place, setPlace],
              page,
              people,
              tents,
              realPrice,
            }}
          />
        </div>

        <div class="order-1 flex flex-col gap-3 sm:order-none">
          {page() === 0 && <Tickets people={[people, setPeople]} />}

          {page() === 1 && (
            <Tents count={totalPeople} tents={[tents, setTents]} />
          )}

          {page() === 2 && (
            <TicketInfos
              people={people}
              infos={[infos, setInfos]}
              shareEmail={[shareEmail, setShareEmail]}
              sharedEmail={[sharedEmail, setSharedEmail]}
              emails={[emails, setEmails]}
            />
          )}

          {page() === 3 && <ConfirmAge setDisabled={setDisabled} />}

          {page() === 4 && (
            <Billing
              {...{
                cvv: [cvv, setCvv],
                creditCard: [creditCard, setCreditCard],
                expiration: [expiration, setExpiration],
              }}
            />
          )}

          {page() === 5 && <Confirm {...{ reserveInfo, reservationValid }} />}

          {page() === 6 && <Done {...{ reserveInfo }} />}
        </div>

        <div />

        <div class="order-last sm:order-none">
          {page() < 5 && (
            <p class="mb-2 text-right text-lg font-medium">
              Total: {realPrice()} <span class="text-subtext0">DKK</span>
            </p>
          )}

          <div class="flex items-center justify-between gap-3 sm:order-none">
            <div />

            {page() < 6 && (
              <div class="flex items-center justify-end gap-3">
                {page() > 0 && (
                  <Button
                    type="button"
                    color="error"
                    onClick={() => {
                      let currentPage = page();

                      if (currentPage === 1) setTents({ type: 0, count: 0 });

                      if (
                        currentPage === 2 &&
                        totalPeople() % 2 !== 0 &&
                        totalPeople() % 3 !== 0
                      )
                        currentPage--;

                      setDisabled(false);
                      setPage(currentPage - 1);
                    }}
                  >
                    Back
                  </Button>
                )}

                <Button
                  type="button"
                  reactive={{
                    color: () => (isDisabled() ? "disabled" : "primary"),
                  }}
                  onClick={onNext}
                >
                  {(isReserving() || isFullfilling()) && <Spinner />}

                  {page() === 0 && "Next"}
                  {page() === 1 && (tents() === 0 ? "Skip" : "Next")}
                  {page() === 2 && "Next"}
                  {page() === 3 && "Checkout"}
                  {page() === 4 && "Reserve"}
                  {page() === 5 && "Confirm"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
