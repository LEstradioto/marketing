import { Controller } from "@hotwired/stimulus"
import tailwindColors from "@maybe/tailwindcolors"
import * as d3 from "d3"

export default class extends Controller {
  static values = {
    series: { type: Object, default: {} },
    data: { type: Array, default: [] },
    useLabels: { type: Boolean, default: true },
  }
  
  #initialElementWidth = 0
  #initialElementHeight = 0

  connect() {
    this.#rememberInitialElementSize()
    this.#drawGridlines()
    this.#drawTwoLinesChart()
    if (this.useLabelsValue) {
      this.#drawXAxis()
      this.#drawLegend()
    }
    this.#installTooltip()
  }

  // Normalize data when it is set
  #data = []
  dataValueChanged(value) {
    this.#data = value.map(d => ({
      ...d,
      date: new Date(d.date),
    }))

    console.log(this.#data);
  }

  #rememberInitialElementSize() {
    this.#initialElementWidth = this.element.clientWidth
    this.#initialElementHeight = this.element.clientHeight
  }

  get #contentWidth() {
    return this.#initialElementWidth - this.#margin.left - this.#margin.right
  }

  get #contentHeight() {
    return this.#initialElementHeight - this.#margin.top - this.#margin.bottom
  }

  get #margin() {
    if (this.useLabelsValue) {
      return { top: 10, right: 0, bottom: 40, left: 0 }
    } else {
      return { top: 0, right: 0, bottom: 0, left: 0 }
    }
  }

  #drawTwoLinesChart() {
    const x = this.#d3XScale;
    const y = this.#d3YScale;

    this.#d3Content
      .append("g")
      .selectAll()
      .data(this.#d3Series)
      .join("g")
        .attr("class", d => this.seriesValue[d.key].strokeClass)
      .append("path")
        .attr("fill", "none")
        .attr("stroke", d => this.seriesValue[d.key].strokeClass)
        .attr("d", d => {
          return d3.line()
            .x(d => x(d.data.date))
            .y(d => y(d[1]))
            .curve(d3.curveMonotoneX)(d);
        });
  }

  #rectPathWithRadius({x, y, width, height, radius}) {
    return `
      M${x},${y + radius}
      Q${x},${y} ${x + radius},${y}
      H${x + width - radius}
      Q${x + width},${y} ${x + width},${y + radius}
      V${y + height}
      H${x}
      Z
    `;
  }

  #drawGridlines() {
    const axisGenerator = d3.axisRight(this.#d3YScale)
      .ticks(10)
      .tickSize(this.#contentWidth)
      .tickFormat("")

    const gridlines = this.#d3Content
      .append("g")
      .attr("class", "d3gridlines")
      .call(axisGenerator)

    gridlines
      .selectAll("line")
      .style("stroke", tailwindColors["alpha-black"][500])
      .style("stroke-dasharray", "1 8")
      .style("stroke-width", "1")
      .style("stroke-linecap", "round");

    gridlines
      .select(".domain")
      .remove()
  }

  #drawXAxis() {
    const formattedDateToday = d3.timeFormat("%d %b %Y")(new Date())

    const axisGenerator = d3.axisBottom(this.#d3XScale)
      .tickValues([ this.#data[0].date, this.#data[this.#data.length - 1].date ])
      .tickSize(0)
      .tickFormat((date) => {
        const formattedDate = d3.timeFormat("%d %b %Y")(date)
        return formattedDate === formattedDateToday ? "Today" : formattedDate
      })

    const axis = this.#d3Content
      .append("g")
      .attr("transform", `translate(0, ${this.#contentHeight - this.#margin.bottom / 2 - 6})`)
      .call(axisGenerator)

    axis
      .select(".domain")
      .remove()

    axis
      .selectAll(".tick text")
      .style("fill", tailwindColors.gray[500])
      .style("font-size", "14px")
      .style("font-weight", "400")
      .attr("text-anchor", (_, i) => i === 0 ? "start" : "end")
  }

  #drawLegend() {
    const legend = this.#d3Content
      .append("g")

    let offsetX = 0;
    Object.values(this.seriesValue).forEach((series, i) => {
      const item = legend
        .append("g")
        .attr("transform", `translate(${offsetX}, 0)`);

      item.append("rect")
        .attr("height", 12)
        .attr("width", 4)
        .attr("class", series.fillClass)
        .attr("rx", 2)
        .attr("ry", 2)
        
      
      item.append("text")
        .attr("x", 10)
        .attr("y", 10)
        .attr("text-anchor", "start")
        .style("fill", tailwindColors.gray[900])
        .style("font-size", "14px")
        .style("font-weight", "400")
        .text(series.name)

      const itemWidth = item.node().getBBox().width;
      offsetX += itemWidth + 12;
    })

    const legendWidth = legend.node().getBBox().width;
    legend.attr("transform", `translate(${this.#contentWidth/2 - legendWidth/2}, ${this.#contentHeight})`)
  }

#installTooltip() {
  const dot1 = this.#d3Content.append("g")
    .attr("class", "focus")
    .style("display", "none");
  const dot2 = this.#d3Content.append("g")
    .attr("class", "focus")
    .style("display", "none");

  dot1.append("circle")
    .attr("r", 3.5)
    .attr("class", this.seriesValue.interest.fillClass);

  dot2.append("circle")
    .attr("r", 3.5)
    .attr("class", this.seriesValue.contributed.fillClass);

  this.#d3Content
    .append("rect")
    .attr("width", this.#contentWidth)
    .attr("height", this.#contentHeight)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .on("mouseover", () => {
      dot1.style("display", null);
      dot2.style("display", null);
    })
    .on("mouseout", (event) => {
      const hoveringOnGuideline = event.toElement?.classList.contains("guideline");
      if (!hoveringOnGuideline) {
        this.#d3Content.selectAll(".guideline").remove();
        this.#d3Tooltip.style("opacity", 0);
        dot1.style("display", "none");
        dot2.style("display", "none");
      }
    })
    .on("mousemove", (event) => {
      const x = this.#d3XScale;
      const d = this.#findDatumByPointer(event);

      this.#d3Content.selectAll(".guideline").remove();

      this.#d3Content
        .insert("path", ":first-child")
        .attr("class", "guideline")
        .attr("fill", tailwindColors["alpha-black"][50])
        .attr("d", this.#rectPathWithRadius({
          x: x(d.date) - x.step() / 8,
          y: 0,
          width: 3 + x.step() / 4,
          height: this.#contentHeight - this.#margin.bottom,
          radius: Math.min(x.bandwidth() / 4, 10),
        }));

      dot1.attr("transform", `translate(${x(d.date)}, ${this.#d3YScale(d.contributed + d.interest)})`);
      dot2.attr("transform", `translate(${x(d.date)}, ${this.#d3YScale(d.contributed)})`);

      this.#d3Tooltip
        .html(this.#tooltipTemplate(d))
        .style("opacity", 1)
        .style("z-index", 999)
        .style("left", this.#tooltipLeft(event) + "px")
        .style("top", event.pageY - 10 + "px");
    });
}

  #tooltipLeft(event) {
    const estimatedTooltipWidth = 250
    const pageWidth = document.body.clientWidth
    const tooltipX = event.pageX + 10
    const overflowX = tooltipX + estimatedTooltipWidth - pageWidth
    const adjustedX = overflowX > 0 ? event.pageX - overflowX - 20 : tooltipX
    return adjustedX
  }

  #tooltipTemplate(datum) {
    return(`
      <div class="mb-1 text-gray-500 font-medium">
        ${d3.timeFormat("%b %d, %Y")(datum.date)}
      </div>

      ${
        Object.entries(this.seriesValue).reverse().map(([key, series]) => `
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <svg width="4" height="12">
                <rect
                  rx="2"
                  ry="2"
                  class="${series.fillClass}"
                  width="4"
                  height="12"
                  ></rect>
              </svg>

              <span class="font-medium">
                ${
                  new Intl.NumberFormat(navigator.language, {
                    style: "currency",
                    currencyDisplay: "narrowSymbol",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(datum[key])
                }
              </span>
            </div>
          </div>
        `).join("")
      }

      <hr class="my-2">

    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="text-gray-500">Total value:</span>
        <span class="font-medium">
          ${
            new Intl.NumberFormat(navigator.language, {
              style: "currency",
              currencyDisplay: "narrowSymbol",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(datum.currentTotalValue)
          }
        </span>
      </div>
    </div>
    `)
  }

  #d3TooltipMemo = null
  get #d3Tooltip() {
    if (this.#d3TooltipMemo) return this.#d3TooltipMemo

    return this.#d3TooltipMemo = this.#d3Element
      .append("div")
      .attr("class", "absolute text-sm bg-white border border-alpha-black-100 p-2 rounded-lg")
      .style("pointer-events", "none")
      .style("opacity", 0)
  }
  
  #d3GroupMemo = null
  get #d3Content() {
    if (this.#d3GroupMemo) return this.#d3GroupMemo

    return this.#d3GroupMemo = this.#d3Svg
      .append("g")
      .attr("transform", `translate(${this.#margin.left},${this.#margin.top})`)
  }

  #d3SvgMemo = null
  get #d3Svg() {
    if (this.#d3SvgMemo) return this.#d3SvgMemo

    this.#d3SvgMemo = this.#d3Element
      .append("svg")
      .attr("width", this.#initialElementWidth)
      .attr("height", this.#initialElementHeight)
      .attr("viewBox", [ 0, 0, this.#initialElementWidth, this.#initialElementHeight ])

    this.#d3SvgMemo.append("defs")
      .append("clipPath")
      .attr("id", "rounded-top")
      .append("path")
      .attr("d", "M0,10 Q0,0 10,0 H90 Q100,0 100,10 V100 H0 Z")

    return this.#d3SvgMemo
  }

  get #d3Element() {
    return d3.select(this.element)
  }

  get #d3Series() {
    const stack = d3.stack()
      .keys(Object.keys(this.seriesValue))

    return stack(this.#data)
  }

  get #d3XScale() {
     return d3.scaleBand()
      .domain(this.#data.map(d => d.date))
      .range([ 0, this.#contentWidth ])
      .padding(.4);
  }

  get #d3YScale() {
    return d3.scaleLinear()
      .domain([0, d3.max(this.#d3Series, d => d3.max(d, d => d[1]))])
      .rangeRound([this.#contentHeight - this.#margin.bottom, this.#margin.top])
  }

  #findDatumByPointer(event) {
    const x = this.#d3XScale
    const [xPos] = d3.pointer(event)

    const index = Math.floor((xPos - x.bandwidth() / 2) / x.step())

    if (index < 0) return this.#data[0]
    if (index >= this.#data.length) return this.#data[this.#data.length - 1]
    return this.#data[index]
  }
}
