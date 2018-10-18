window.navigation = window.navigation || {},
function(n) {
  navigation.menu = {
    constants: {
      sectionTemplate: '.section-template',
      contentContainer: '#wrapper',
      startSectionMenuItem: '#homeMenu',
      startSection: '#home'
    },

    importSectionsToDOM: function() {
      const links = document.querySelectorAll('link[rel="import"]')
      Array.prototype.forEach.call(links, function(link) {
        let template = link.import.querySelector(navigation.menu.constants.sectionTemplate)
        let clone = document.importNode(template.content, true)
        document.querySelector(navigation.menu.constants.contentContainer).appendChild(clone)
      })
    },

    setMenuOnClickEvent: function() {
      document.body.addEventListener('click', function(event) {
        if (event.target.dataset.section) {
          navigation.menu.hideAllSections()
          navigation.menu.showSection(event)
        }
      })
    },

    showSection: function(event) {
      const sectionId = event.target.dataset.section
      $('#' + sectionId).show()
      $('#' + sectionId + ' section').show()
      if (sectionId === "backtest" || sectionId === "trade" || sectionId === "optimize") {
        loadStrategiesBt();
        fillBtTestPeriod();
        fillOpTestPeriod();
      }
      if (sectionId === "trade") {
        fillOldExecutions();
      }

    },

    showStartSection: function() {
      $(this.constants.startSectionMenuItem).click()
      $(this.constants.startSection).show()
      $(this.constants.startSection + ' section').show()
    },

    hideAllSections: function() {
      $(this.constants.contentContainer + ' section').hide()
    },

    init: function() {
      this.importSectionsToDOM()
      this.setMenuOnClickEvent()
      this.showStartSection()

      $(document.body).click(function(e) {
        let dropDowns = $('.drop-down');
        let dropDownsWhite = $('.drop-down-white');
        dropDowns.push.apply(dropDowns, dropDownsWhite)
        dropDowns.each((index, dropdown) => {
          if ($(dropdown).find('ul').is(':visible') && ($(e.target).closest($(dropdown)).length === 0)) {
            $(dropdown).find('ul').hide();
            $(dropdown).find('a').removeClass('expanded');
          }
        });
      });
    }
  };

  n(function() {
    navigation.menu.init()
  })
}(jQuery);
